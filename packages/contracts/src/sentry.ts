import * as Schema from "effect/Schema";

import { ProjectId, TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";

export const SentryIssueFilter = Schema.Literals(["unresolved", "for_review", "all"]);
export type SentryIssueFilter = typeof SentryIssueFilter.Type;

export const SentryProject = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
});
export type SentryProject = typeof SentryProject.Type;

export const SentryListProjectsInput = Schema.Struct({});
export const SentryListProjectsResult = Schema.Struct({
  organization: Schema.String,
  projects: Schema.Array(SentryProject),
});
export type SentryListProjectsResult = typeof SentryListProjectsResult.Type;

export const SentryIssueSummary = Schema.Struct({
  id: Schema.String,
  shortId: Schema.String,
  title: Schema.String,
  culprit: Schema.NullOr(Schema.String),
  level: Schema.String,
  status: Schema.String,
  /** Sentry returns event counts as strings. */
  count: Schema.String,
  userCount: Schema.Number,
  firstSeen: Schema.String,
  lastSeen: Schema.String,
  permalink: Schema.String,
  projectSlug: Schema.String,
});
export type SentryIssueSummary = typeof SentryIssueSummary.Type;

export const SentryListIssuesInput = Schema.Struct({
  projectId: ProjectId,
  filter: SentryIssueFilter,
  query: Schema.optionalKey(TrimmedString),
  cursor: Schema.optionalKey(TrimmedNonEmptyString),
});
export type SentryListIssuesInput = typeof SentryListIssuesInput.Type;

export const SentryListIssuesResult = Schema.Struct({
  issues: Schema.Array(SentryIssueSummary),
  nextCursor: Schema.NullOr(Schema.String),
});
export type SentryListIssuesResult = typeof SentryListIssuesResult.Type;

export const SentryIssueDetailInput = Schema.Struct({ issueId: TrimmedNonEmptyString });
export type SentryIssueDetailInput = typeof SentryIssueDetailInput.Type;

export const SentryFrame = Schema.Struct({
  filename: Schema.NullOr(Schema.String),
  function: Schema.NullOr(Schema.String),
  lineNo: Schema.NullOr(Schema.Number),
  inApp: Schema.Boolean,
  context: Schema.Array(Schema.Struct({ lineNo: Schema.Number, line: Schema.String })),
});

export const SentryException = Schema.Struct({
  type: Schema.String,
  value: Schema.String,
  frames: Schema.Array(SentryFrame),
});

export const SentryIssueDetail = Schema.Struct({
  ...SentryIssueSummary.fields,
  eventId: Schema.NullOr(Schema.String),
  release: Schema.NullOr(Schema.String),
  environment: Schema.NullOr(Schema.String),
  exceptions: Schema.Array(SentryException),
  tags: Schema.Array(Schema.Struct({ key: Schema.String, value: Schema.String })),
  breadcrumbs: Schema.Array(
    Schema.Struct({
      timestamp: Schema.NullOr(Schema.String),
      category: Schema.NullOr(Schema.String),
      level: Schema.NullOr(Schema.String),
      message: Schema.NullOr(Schema.String),
    }),
  ),
});
export type SentryIssueDetail = typeof SentryIssueDetail.Type;
