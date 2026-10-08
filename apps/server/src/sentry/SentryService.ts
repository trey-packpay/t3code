import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/http";
import {
  IssueTrackerError,
  type IssueTrackerErrorReason,
  type SentryIssueDetail,
  type SentryIssueDetailInput,
  type SentryIssueSummary,
  type SentryListIssuesInput,
  type SentryListIssuesResult,
  type SentryListProjectsResult,
  SentryProject,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";

import {
  executeJson,
  isHeaderSafeToken,
  type IssueTrackerHttpFailure,
} from "../issueTrackers/issueTrackerHttp.ts";
import * as ServerSettings from "../serverSettings.ts";

const DEFAULT_BASE_URL = "https://sentry.io";
const PAGE_SIZE = 50;
const FRAME_LIMIT = 30;
const CONTEXT_LINES_LIMIT = 7;
const EXCEPTION_LIMIT = 5;
const EXCEPTION_VALUE_MAX_CHARS = 2_000;
const BREADCRUMB_MESSAGE_MAX_CHARS = 500;
const BREADCRUMB_LIMIT = 20;
const TAG_LIMIT = 40;

export class SentryService extends Context.Service<
  SentryService,
  {
    readonly listProjects: Effect.Effect<SentryListProjectsResult, IssueTrackerError>;
    readonly listIssues: (
      input: SentryListIssuesInput,
    ) => Effect.Effect<SentryListIssuesResult, IssueTrackerError>;
    readonly issueDetail: (
      input: SentryIssueDetailInput,
    ) => Effect.Effect<SentryIssueDetail, IssueTrackerError>;
  }
>()("t3/sentry/SentryService") {}

const RawIssue = Schema.Struct({
  id: Schema.String,
  shortId: Schema.String,
  title: Schema.String,
  culprit: Schema.optional(Schema.NullOr(Schema.String)),
  level: Schema.String,
  status: Schema.String,
  count: Schema.Union([Schema.String, Schema.Number]),
  userCount: Schema.optional(Schema.NullOr(Schema.Number)),
  firstSeen: Schema.String,
  lastSeen: Schema.String,
  permalink: Schema.String,
  project: Schema.Struct({ slug: Schema.String }),
});
type RawIssue = typeof RawIssue.Type;

const RawFrame = Schema.Struct({
  filename: Schema.optional(Schema.NullOr(Schema.String)),
  function: Schema.optional(Schema.NullOr(Schema.String)),
  lineNo: Schema.optional(Schema.NullOr(Schema.Number)),
  inApp: Schema.optional(Schema.NullOr(Schema.Boolean)),
  context: Schema.optional(
    Schema.NullOr(Schema.Array(Schema.Tuple([Schema.Number, Schema.NullOr(Schema.String)]))),
  ),
});
const ExceptionEntryData = Schema.Struct({
  values: Schema.Array(
    Schema.Struct({
      type: Schema.optional(Schema.NullOr(Schema.String)),
      value: Schema.optional(Schema.NullOr(Schema.String)),
      stacktrace: Schema.optional(Schema.NullOr(Schema.Struct({ frames: Schema.Array(RawFrame) }))),
    }),
  ),
});
const BreadcrumbEntryData = Schema.Struct({
  values: Schema.Array(
    Schema.Struct({
      timestamp: Schema.optional(Schema.NullOr(Schema.String)),
      category: Schema.optional(Schema.NullOr(Schema.String)),
      level: Schema.optional(Schema.NullOr(Schema.String)),
      message: Schema.optional(Schema.NullOr(Schema.String)),
    }),
  ),
});
const RawEvent = Schema.Struct({
  eventID: Schema.optional(Schema.NullOr(Schema.String)),
  release: Schema.optional(Schema.NullOr(Schema.Struct({ version: Schema.String }))),
  tags: Schema.optional(Schema.Array(Schema.Struct({ key: Schema.String, value: Schema.String }))),
  entries: Schema.optional(
    Schema.Array(Schema.Struct({ type: Schema.String, data: Schema.Unknown })),
  ),
});
type RawEvent = typeof RawEvent.Type;

const decodeExceptionData = Schema.decodeUnknownOption(ExceptionEntryData);
const decodeBreadcrumbData = Schema.decodeUnknownOption(BreadcrumbEntryData);

const fail = (reason: IssueTrackerErrorReason, upstreamMessage?: string) =>
  new IssueTrackerError({
    source: "sentry",
    reason,
    ...(upstreamMessage === undefined ? {} : { upstreamMessage }),
  });
const fromHttpFailure = (failure: IssueTrackerHttpFailure) =>
  fail(failure.reason, failure.upstreamMessage);

const toSummary = (issue: RawIssue): SentryIssueSummary => ({
  id: issue.id,
  shortId: issue.shortId,
  title: issue.title,
  culprit: issue.culprit ?? null,
  level: issue.level,
  status: issue.status,
  count: String(issue.count),
  userCount: issue.userCount ?? 0,
  firstSeen: issue.firstSeen,
  lastSeen: issue.lastSeen,
  permalink: issue.permalink,
  projectSlug: issue.project.slug,
});

/** `<url>; rel="next"; results="true"; cursor="0:100:0"` → the cursor when more results exist. */
export function nextCursorFromLink(link: string | undefined): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    if (!/rel="next"/.test(part) || !/results="true"/.test(part)) continue;
    const match = /cursor="([^"]+)"/.exec(part);
    if (match?.[1]) return match[1];
  }
  return null;
}

const FILTER_QUERIES: Record<SentryListIssuesInput["filter"], string> = {
  unresolved: "is:unresolved",
  for_review: "is:unresolved is:for_review",
  all: "",
};

function eventDetail(event: RawEvent | null) {
  const entries = event?.entries ?? [];
  const exceptions = entries
    .filter((entry) => entry.type === "exception")
    .flatMap((entry) =>
      Option.match(decodeExceptionData(entry.data), {
        onNone: () => [],
        onSome: (data) => data.values,
      }),
    )
    // Chained exceptions are oldest-first; the one that was raised is last.
    .slice(-EXCEPTION_LIMIT)
    .map((value) => {
      const frames = value.stacktrace?.frames ?? [];
      const inApp = frames.filter((frame) => frame.inApp === true);
      // Frames are oldest-first; the crash site is last. Prefer the application's own code.
      const chosen = (inApp.length > 0 ? inApp : frames).slice(-FRAME_LIMIT);
      return {
        type: value.type ?? "Error",
        value: (value.value ?? "").slice(0, EXCEPTION_VALUE_MAX_CHARS),
        frames: chosen.map((frame) => ({
          filename: frame.filename ?? null,
          function: frame.function ?? null,
          lineNo: frame.lineNo ?? null,
          inApp: frame.inApp === true,
          context: (frame.context ?? [])
            .slice(0, CONTEXT_LINES_LIMIT)
            .map(([lineNo, line]) => ({ lineNo, line: line ?? "" })),
        })),
      };
    });
  const breadcrumbs = entries
    .filter((entry) => entry.type === "breadcrumbs")
    .flatMap((entry) =>
      Option.match(decodeBreadcrumbData(entry.data), {
        onNone: () => [],
        onSome: (data) => data.values,
      }),
    )
    .slice(-BREADCRUMB_LIMIT)
    .map((crumb) => ({
      timestamp: crumb.timestamp ?? null,
      category: crumb.category ?? null,
      level: crumb.level ?? null,
      message: crumb.message?.slice(0, BREADCRUMB_MESSAGE_MAX_CHARS) ?? null,
    }));
  const tags = (event?.tags ?? []).slice(0, TAG_LIMIT);
  return {
    eventId: event?.eventID ?? null,
    release: event?.release?.version ?? null,
    environment: tags.find((tag) => tag.key === "environment")?.value ?? null,
    exceptions,
    tags,
    breadcrumbs,
  };
}

const make = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const serverSettings = yield* ServerSettings.ServerSettingsService;

  const requireConfig = serverSettings.getSettings.pipe(
    Effect.mapError(() => fail("upstream", "Server settings could not be read.")),
    Effect.flatMap((settings) => {
      const { authToken, organization } = settings.sentry;
      if (!isHeaderSafeToken(authToken) || organization.length === 0)
        return Effect.fail(fail("not-configured"));
      const baseUrl = (settings.sentry.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
      return Effect.succeed({ settings, authToken, organization, baseUrl });
    }),
  );

  const get = <S extends Schema.Top>(authToken: string, url: string, schema: S) =>
    executeJson(
      httpClient,
      HttpClientRequest.get(url).pipe(HttpClientRequest.bearerToken(authToken)),
      schema,
    ).pipe(Effect.mapError(fromHttpFailure));

  const listProjects = Effect.gen(function* () {
    const config = yield* requireConfig;
    const { value } = yield* get(
      config.authToken,
      `${config.baseUrl}/api/0/organizations/${encodeURIComponent(config.organization)}/projects/?per_page=100`,
      Schema.Array(SentryProject),
    );
    return { organization: config.organization, projects: value };
  }).pipe(Effect.withSpan("SentryService.listProjects"));

  const listIssues = Effect.fn("SentryService.listIssues")(function* (
    input: SentryListIssuesInput,
  ) {
    const config = yield* requireConfig;
    const projects = resolveProjectSettings(config.settings, input.projectId).settings
      .sentryProjects;
    if (projects.length === 0) return yield* fail("no-mapping");
    const params = new URLSearchParams();
    for (const project of projects) params.append("project", project.id);
    const query = [FILTER_QUERIES[input.filter], input.query?.trim() ?? ""]
      .filter(Boolean)
      .join(" ");
    params.set("query", query);
    params.set("statsPeriod", "14d");
    params.set("limit", String(PAGE_SIZE));
    if (input.cursor) params.set("cursor", input.cursor);
    const { value, headers } = yield* get(
      config.authToken,
      `${config.baseUrl}/api/0/organizations/${encodeURIComponent(config.organization)}/issues/?${params}`,
      Schema.Array(RawIssue),
    );
    return { issues: value.map(toSummary), nextCursor: nextCursorFromLink(headers["link"]) };
  });

  const issueDetail = Effect.fn("SentryService.issueDetail")(function* (
    input: SentryIssueDetailInput,
  ) {
    const config = yield* requireConfig;
    const issueUrl = `${config.baseUrl}/api/0/organizations/${encodeURIComponent(config.organization)}/issues/${encodeURIComponent(input.issueId)}/`;
    const { value: issue } = yield* get(config.authToken, issueUrl, RawIssue);
    // An issue whose events were all dropped has no latest event; show the issue anyway.
    const event = yield* get(config.authToken, `${issueUrl}events/latest/`, RawEvent).pipe(
      Effect.map(({ value }) => value),
      Effect.catchTags({
        IssueTrackerError: (error) =>
          error.reason === "not-found" ? Effect.succeed(null) : Effect.fail(error),
      }),
    );
    return { ...toSummary(issue), ...eventDetail(event) };
  });

  return SentryService.of({ listProjects, listIssues, issueDetail });
});

export const layer = Layer.effect(SentryService, make);
