import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/http";
import {
  IssueTrackerError,
  type IssueTrackerErrorReason,
  type LinearIssueDetail,
  type LinearIssueDetailInput,
  LinearIssueSummary,
  type LinearListIssuesInput,
  type LinearListIssuesResult,
  type LinearListTeamsResult,
  LinearTeam,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";

import {
  classifyIssueTrackerError,
  ERROR_BODY_MAX_CHARS,
  executeJson,
  isHeaderSafeToken,
  type IssueTrackerHttpFailure,
} from "../issueTrackers/issueTrackerHttp.ts";
import * as ServerSettings from "../serverSettings.ts";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";
const PAGE_SIZE = 50;
const COMMENT_LIMIT = 20;

export class LinearService extends Context.Service<
  LinearService,
  {
    readonly listTeams: Effect.Effect<LinearListTeamsResult, IssueTrackerError>;
    readonly listIssues: (
      input: LinearListIssuesInput,
    ) => Effect.Effect<LinearListIssuesResult, IssueTrackerError>;
    readonly issueDetail: (
      input: LinearIssueDetailInput,
    ) => Effect.Effect<LinearIssueDetail, IssueTrackerError>;
  }
>()("t3/linear/LinearService") {}

const ISSUE_FIELDS = `id identifier title url priority updatedAt
  state { name type color }
  assignee { name avatarUrl }`;

const ISSUES_QUERY = `query Issues($filter: IssueFilter, $after: String) {
  issues(filter: $filter, first: ${PAGE_SIZE}, after: $after, orderBy: updatedAt) {
    nodes { ${ISSUE_FIELDS} }
    pageInfo { hasNextPage endCursor }
  }
}`;

const ISSUE_QUERY = `query Issue($id: String!) {
  issue(id: $id) {
    ${ISSUE_FIELDS}
    description createdAt
    labels { nodes { name color } }
    project { name }
    cycle { name number }
    comments(last: ${COMMENT_LIMIT}) { nodes { body createdAt user { name } } }
  }
}`;

const TEAMS_QUERY = `query Teams { viewer { name } teams(first: 100) { nodes { id key name } } }`;

const envelope = <S extends Schema.Top>(data: S) =>
  Schema.Struct({
    data: Schema.optional(Schema.NullOr(data)),
    errors: Schema.optional(
      Schema.Array(
        Schema.Struct({
          message: Schema.String,
          extensions: Schema.optional(Schema.Struct({ code: Schema.optional(Schema.String) })),
        }),
      ),
    ),
  });

const IssuesData = Schema.Struct({
  issues: Schema.Struct({
    nodes: Schema.Array(LinearIssueSummary),
    pageInfo: Schema.Struct({
      hasNextPage: Schema.Boolean,
      endCursor: Schema.NullOr(Schema.String),
    }),
  }),
});

const IssueData = Schema.Struct({
  issue: Schema.NullOr(
    Schema.Struct({
      ...LinearIssueSummary.fields,
      description: Schema.NullOr(Schema.String),
      createdAt: Schema.String,
      labels: Schema.Struct({
        nodes: Schema.Array(Schema.Struct({ name: Schema.String, color: Schema.String })),
      }),
      project: Schema.NullOr(Schema.Struct({ name: Schema.String })),
      cycle: Schema.NullOr(
        Schema.Struct({ name: Schema.NullOr(Schema.String), number: Schema.Number }),
      ),
      comments: Schema.Struct({
        nodes: Schema.Array(
          Schema.Struct({
            body: Schema.String,
            createdAt: Schema.String,
            user: Schema.NullOr(Schema.Struct({ name: Schema.String })),
          }),
        ),
      }),
    }),
  ),
});

const TeamsData = Schema.Struct({
  viewer: Schema.Struct({ name: Schema.String }),
  teams: Schema.Struct({ nodes: Schema.Array(LinearTeam) }),
});

const fail = (reason: IssueTrackerErrorReason, upstreamMessage?: string) =>
  new IssueTrackerError({
    source: "linear",
    reason,
    ...(upstreamMessage === undefined ? {} : { upstreamMessage }),
  });

const fromHttpFailure = (failure: IssueTrackerHttpFailure) =>
  fail(failure.reason, failure.upstreamMessage);

const make = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const serverSettings = yield* ServerSettings.ServerSettingsService;

  // Read on every request so a saved or removed key applies without a restart.
  const readSettings = serverSettings.getSettings.pipe(
    Effect.mapError(() => fail("upstream", "Server settings could not be read.")),
  );

  const requireApiKey = readSettings.pipe(
    Effect.flatMap((settings) =>
      isHeaderSafeToken(settings.linear.apiKey)
        ? Effect.succeed({ settings, apiKey: settings.linear.apiKey })
        : Effect.fail(fail("not-configured")),
    ),
  );

  const graphql = <S extends Schema.Top>(
    apiKey: string,
    query: string,
    variables: Record<string, unknown>,
    data: S,
  ) =>
    executeJson(
      httpClient,
      HttpClientRequest.post(LINEAR_GRAPHQL_URL).pipe(
        // Linear personal API keys go in the header as-is, without "Bearer".
        HttpClientRequest.setHeader("authorization", apiKey),
        HttpClientRequest.bodyJsonUnsafe({ query, variables }),
      ),
      envelope(data),
    ).pipe(
      Effect.mapError(fromHttpFailure),
      Effect.flatMap(({ value }) => {
        const first = value.errors?.[0];
        if (first !== undefined) {
          return Effect.fail(
            fail(
              classifyIssueTrackerError(`${first.message} ${first.extensions?.code ?? ""}`),
              first.message.slice(0, ERROR_BODY_MAX_CHARS),
            ),
          );
        }
        return value.data === undefined || value.data === null
          ? Effect.fail(fail("upstream", "Linear returned no data."))
          : Effect.succeed(value.data as S["Type"]);
      }),
    );

  const listTeams = Effect.gen(function* () {
    const { apiKey } = yield* requireApiKey;
    const data = yield* graphql(apiKey, TEAMS_QUERY, {}, TeamsData);
    return { viewerName: data.viewer.name, teams: data.teams.nodes };
  }).pipe(Effect.withSpan("LinearService.listTeams"));

  const listIssues = Effect.fn("LinearService.listIssues")(function* (
    input: LinearListIssuesInput,
  ) {
    const { settings, apiKey } = yield* requireApiKey;
    const teamIds = resolveProjectSettings(settings, input.projectId).settings.linearTeamIds;
    if (teamIds.length === 0) return yield* fail("no-mapping");
    const query = input.query?.trim() ?? "";
    const filter = {
      team: { id: { in: teamIds } },
      ...(input.filter === "all" ? {} : { state: { type: { nin: ["completed", "canceled"] } } }),
      ...(input.filter === "mine" ? { assignee: { isMe: { eq: true } } } : {}),
      ...(query.length > 0
        ? {
            or: [
              { title: { containsIgnoreCase: query } },
              { description: { containsIgnoreCase: query } },
            ],
          }
        : {}),
    };
    const data = yield* graphql(
      apiKey,
      ISSUES_QUERY,
      { filter, after: input.cursor ?? null },
      IssuesData,
    );
    return {
      issues: data.issues.nodes,
      nextCursor: data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null,
    };
  });

  const issueDetail = Effect.fn("LinearService.issueDetail")(function* (
    input: LinearIssueDetailInput,
  ) {
    const { apiKey } = yield* requireApiKey;
    // `issue(id:)` accepts the human identifier ("ENG-123") as well as the UUID.
    const data = yield* graphql(apiKey, ISSUE_QUERY, { id: input.identifier }, IssueData);
    const issue = data.issue;
    if (issue === null) return yield* fail("not-found");
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      priority: issue.priority,
      updatedAt: issue.updatedAt,
      state: issue.state,
      assignee: issue.assignee,
      description: issue.description ?? "",
      createdAt: issue.createdAt,
      labels: issue.labels.nodes,
      projectName: issue.project?.name ?? null,
      cycleName: issue.cycle === null ? null : (issue.cycle.name ?? `Cycle ${issue.cycle.number}`),
      comments: issue.comments.nodes.map((comment) => ({
        author: comment.user?.name ?? "Unknown",
        body: comment.body,
        createdAt: comment.createdAt,
      })),
    };
  });

  return LinearService.of({ listTeams, listIssues, issueDetail });
});

export const layer = Layer.effect(LinearService, make);
