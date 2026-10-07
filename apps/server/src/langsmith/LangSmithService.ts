import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/http";
import {
  IssueTrackerError,
  type IssueTrackerErrorReason,
  type LangSmithListProjectsResult,
  type LangSmithListRunsInput,
  type LangSmithListRunsResult,
  LangSmithProject,
  type LangSmithRunDetail,
  type LangSmithRunDetailInput,
  type LangSmithRunSummary,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";

import {
  executeJson,
  isHeaderSafeToken,
  type IssueTrackerHttpFailure,
} from "../issueTrackers/issueTrackerHttp.ts";
import * as ServerSettings from "../serverSettings.ts";

const DEFAULT_ENDPOINT = "https://api.smith.langchain.com";
const PAGE_SIZE = 50;
const CHILD_LIMIT = 100;
const JSON_FIELD_MAX_CHARS = 32_000;
const WINDOW_MS: Record<LangSmithListRunsInput["window"], number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};
const encodeSearchQuery = Schema.encodeSync(Schema.fromJsonString(Schema.String));

export class LangSmithService extends Context.Service<
  LangSmithService,
  {
    readonly listProjects: Effect.Effect<LangSmithListProjectsResult, IssueTrackerError>;
    readonly listErroredRuns: (
      input: LangSmithListRunsInput,
    ) => Effect.Effect<LangSmithListRunsResult, IssueTrackerError>;
    readonly runDetail: (
      input: LangSmithRunDetailInput,
    ) => Effect.Effect<LangSmithRunDetail, IssueTrackerError>;
  }
>()("t3/langsmith/LangSmithService") {}

const RawRun = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  run_type: Schema.String,
  error: Schema.optional(Schema.NullOr(Schema.String)),
  session_id: Schema.optional(Schema.NullOr(Schema.String)),
  start_time: Schema.String,
  end_time: Schema.optional(Schema.NullOr(Schema.String)),
  total_tokens: Schema.optional(Schema.NullOr(Schema.Number)),
  trace_id: Schema.optional(Schema.NullOr(Schema.String)),
  parent_run_id: Schema.optional(Schema.NullOr(Schema.String)),
  app_path: Schema.optional(Schema.NullOr(Schema.String)),
  inputs: Schema.optional(Schema.Unknown),
  outputs: Schema.optional(Schema.Unknown),
});
type RawRun = typeof RawRun.Type;

const RunsPage = Schema.Struct({
  runs: Schema.Array(RawRun),
  cursors: Schema.optional(
    Schema.NullOr(Schema.Struct({ next: Schema.optional(Schema.NullOr(Schema.String)) })),
  ),
});

const fail = (reason: IssueTrackerErrorReason, upstreamMessage?: string) =>
  new IssueTrackerError({
    source: "langsmith",
    reason,
    ...(upstreamMessage === undefined ? {} : { upstreamMessage }),
  });
const fromHttpFailure = (failure: IssueTrackerHttpFailure) =>
  fail(failure.reason, failure.upstreamMessage);

const latencyMs = (run: RawRun): number | null => {
  if (!run.end_time) return null;
  const elapsed = Date.parse(run.end_time) - Date.parse(run.start_time);
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : null;
};

/** `api.smith.langchain.com` → `smith.langchain.com`; self-hosted hosts are used as-is. */
export function appOriginFor(endpoint: string): string {
  const url = new URL(endpoint);
  url.hostname = url.hostname.replace(/(^|\.)api\./, "$1");
  return url.origin;
}

function prettyJson(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value ?? null, null, 2) ?? "null";
  } catch {
    text = String(value);
  }
  return text.length > JSON_FIELD_MAX_CHARS
    ? `${text.slice(0, JSON_FIELD_MAX_CHARS)}\n…truncated`
    : text;
}

const make = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const serverSettings = yield* ServerSettings.ServerSettingsService;

  const requireConfig = serverSettings.getSettings.pipe(
    Effect.mapError(() => fail("upstream", "Server settings could not be read.")),
    Effect.flatMap((settings) =>
      !isHeaderSafeToken(settings.langsmith.apiKey)
        ? Effect.fail(fail("not-configured"))
        : Effect.succeed({
            settings,
            apiKey: settings.langsmith.apiKey,
            endpoint: (settings.langsmith.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, ""),
          }),
    ),
  );

  const request = <S extends Schema.Top>(
    apiKey: string,
    req: HttpClientRequest.HttpClientRequest,
    schema: S,
  ) =>
    executeJson(
      httpClient,
      req.pipe(HttpClientRequest.setHeader("x-api-key", apiKey)),
      schema,
    ).pipe(
      Effect.map(({ value }) => value),
      Effect.mapError(fromHttpFailure),
    );

  const listProjects = Effect.gen(function* () {
    const config = yield* requireConfig;
    const projects = yield* request(
      config.apiKey,
      HttpClientRequest.get(`${config.endpoint}/api/v1/sessions?limit=${PAGE_SIZE}`),
      Schema.Array(LangSmithProject),
    );
    return { projects: projects.slice(0, PAGE_SIZE) };
  }).pipe(Effect.withSpan("LangSmithService.listProjects"));

  const listErroredRuns = Effect.fn("LangSmithService.listErroredRuns")(function* (
    input: LangSmithListRunsInput,
  ) {
    const config = yield* requireConfig;
    const projects = resolveProjectSettings(config.settings, input.projectId).settings
      .langsmithProjects;
    if (projects.length === 0) return yield* fail("no-mapping");
    const names = new Map(projects.map((project) => [project.id, project.name]));
    const query = input.query?.trim() ?? "";
    const now = yield* DateTime.now;
    const body = {
      session: projects.map((project) => project.id),
      is_root: true,
      error: true,
      start_time: DateTime.formatIso(DateTime.subtractDuration(now, WINDOW_MS[input.window])),
      limit: PAGE_SIZE,
      select: [
        "id",
        "name",
        "run_type",
        "error",
        "session_id",
        "start_time",
        "end_time",
        "total_tokens",
      ],
      ...(query.length > 0 ? { filter: `search(${encodeSearchQuery(query)})` } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    };
    const page = yield* request(
      config.apiKey,
      HttpClientRequest.post(`${config.endpoint}/api/v1/runs/query`).pipe(
        HttpClientRequest.bodyJsonUnsafe(body),
      ),
      RunsPage,
    );
    const runs: LangSmithRunSummary[] = page.runs.slice(0, PAGE_SIZE).map((run) => ({
      id: run.id,
      name: run.name,
      runType: run.run_type,
      errorFirstLine: (run.error ?? "").split("\n")[0]?.slice(0, 300) ?? "",
      projectName: (run.session_id && names.get(run.session_id)) || "",
      startTime: run.start_time,
      latencyMs: latencyMs(run),
      totalTokens: run.total_tokens ?? null,
    }));
    return { runs, nextCursor: page.cursors?.next ?? null };
  });

  const runDetail = Effect.fn("LangSmithService.runDetail")(function* (
    input: LangSmithRunDetailInput,
  ) {
    const config = yield* requireConfig;
    const run = yield* request(
      config.apiKey,
      HttpClientRequest.get(`${config.endpoint}/api/v1/runs/${encodeURIComponent(input.runId)}`),
      RawRun,
    );
    const traceId = run.trace_id ?? run.id;
    const trace = yield* request(
      config.apiKey,
      HttpClientRequest.post(`${config.endpoint}/api/v1/runs/query`).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          trace: traceId,
          limit: Math.min(CHILD_LIMIT, PAGE_SIZE),
          select: ["id", "name", "run_type", "error", "start_time", "end_time", "parent_run_id"],
        }),
      ),
      RunsPage,
    ).pipe(Effect.orElseSucceed(() => ({ runs: [], cursors: null })));
    const traceRuns = trace.runs.slice(0, Math.min(CHILD_LIMIT, PAGE_SIZE));
    const parents = new Map(traceRuns.map((child) => [child.id, child.parent_run_id ?? null]));
    const depthOf = (id: string): number => {
      let depth = 0;
      let parent = parents.get(id) ?? null;
      while (parent !== null && depth < 50) {
        depth += 1;
        parent = parents.get(parent) ?? null;
      }
      return depth;
    };
    const children = traceRuns
      .filter((child) => child.id !== run.id)
      .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))
      .map((child) => ({
        name: child.name,
        runType: child.run_type,
        depth: depthOf(child.id),
        failed: Boolean(child.error),
        latencyMs: latencyMs(child),
      }));
    const origin = appOriginFor(config.endpoint);
    return {
      id: run.id,
      name: run.name,
      runType: run.run_type,
      errorFirstLine: (run.error ?? "").split("\n")[0]?.slice(0, 300) ?? "",
      projectName: "",
      startTime: run.start_time,
      latencyMs: latencyMs(run),
      totalTokens: run.total_tokens ?? null,
      url: run.app_path ? `${origin}${run.app_path}` : origin,
      error: (run.error ?? "").slice(0, JSON_FIELD_MAX_CHARS),
      inputsJson: prettyJson(run.inputs),
      outputsJson:
        run.outputs === undefined || run.outputs === null ? null : prettyJson(run.outputs),
      children,
    };
  });

  return LangSmithService.of({ listProjects, listErroredRuns, runDetail });
});

export const layer = Layer.effect(LangSmithService, make);
