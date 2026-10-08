import * as Schema from "effect/Schema";

import { ProjectId, TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";

export const LinearIssueFilter = Schema.Literals(["open", "mine", "all"]);
export type LinearIssueFilter = typeof LinearIssueFilter.Type;

export const LinearUser = Schema.Struct({
  name: Schema.String,
  avatarUrl: Schema.NullOr(Schema.String),
});

export const LinearIssueState = Schema.Struct({
  name: Schema.String,
  /** backlog | unstarted | started | completed | canceled | triage */
  type: Schema.String,
  color: Schema.String,
});

export const LinearIssueSummary = Schema.Struct({
  id: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
  url: Schema.String,
  /** 0 none, 1 urgent, 2 high, 3 medium, 4 low */
  priority: Schema.Number,
  updatedAt: Schema.String,
  state: LinearIssueState,
  assignee: Schema.NullOr(LinearUser),
});
export type LinearIssueSummary = typeof LinearIssueSummary.Type;

export const LinearListIssuesInput = Schema.Struct({
  projectId: ProjectId,
  filter: LinearIssueFilter,
  query: Schema.optionalKey(TrimmedString),
  cursor: Schema.optionalKey(TrimmedNonEmptyString),
});
export type LinearListIssuesInput = typeof LinearListIssuesInput.Type;

export const LinearListIssuesResult = Schema.Struct({
  issues: Schema.Array(LinearIssueSummary),
  nextCursor: Schema.NullOr(Schema.String),
});
export type LinearListIssuesResult = typeof LinearListIssuesResult.Type;

export const LinearIssueDetailInput = Schema.Struct({ identifier: TrimmedNonEmptyString });
export type LinearIssueDetailInput = typeof LinearIssueDetailInput.Type;

export const LinearComment = Schema.Struct({
  author: Schema.String,
  body: Schema.String,
  createdAt: Schema.String,
});

export const LinearIssueDetail = Schema.Struct({
  ...LinearIssueSummary.fields,
  description: Schema.String,
  createdAt: Schema.String,
  labels: Schema.Array(Schema.Struct({ name: Schema.String, color: Schema.String })),
  projectName: Schema.NullOr(Schema.String),
  cycleName: Schema.NullOr(Schema.String),
  comments: Schema.Array(LinearComment),
});
export type LinearIssueDetail = typeof LinearIssueDetail.Type;

export const LinearListTeamsInput = Schema.Struct({});

export const LinearTeam = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
});
export type LinearTeam = typeof LinearTeam.Type;

export const LinearListTeamsResult = Schema.Struct({
  viewerName: Schema.String,
  teams: Schema.Array(LinearTeam),
});
export type LinearListTeamsResult = typeof LinearListTeamsResult.Type;
