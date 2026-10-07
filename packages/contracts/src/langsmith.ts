import * as Schema from "effect/Schema";

import { ProjectId, TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";

export const LangSmithRunWindow = Schema.Literals(["24h", "7d", "30d"]);
export type LangSmithRunWindow = typeof LangSmithRunWindow.Type;

export const LangSmithProject = Schema.Struct({ id: Schema.String, name: Schema.String });
export type LangSmithProject = typeof LangSmithProject.Type;

export const LangSmithListProjectsInput = Schema.Struct({});
export const LangSmithListProjectsResult = Schema.Struct({
  projects: Schema.Array(LangSmithProject),
});
export type LangSmithListProjectsResult = typeof LangSmithListProjectsResult.Type;

export const LangSmithRunSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  runType: Schema.String,
  errorFirstLine: Schema.String,
  projectName: Schema.String,
  startTime: Schema.String,
  latencyMs: Schema.NullOr(Schema.Number),
  totalTokens: Schema.NullOr(Schema.Number),
});
export type LangSmithRunSummary = typeof LangSmithRunSummary.Type;

export const LangSmithListRunsInput = Schema.Struct({
  projectId: ProjectId,
  window: LangSmithRunWindow,
  query: Schema.optionalKey(TrimmedString),
  cursor: Schema.optionalKey(TrimmedNonEmptyString),
});
export type LangSmithListRunsInput = typeof LangSmithListRunsInput.Type;

export const LangSmithListRunsResult = Schema.Struct({
  runs: Schema.Array(LangSmithRunSummary),
  nextCursor: Schema.NullOr(Schema.String),
});
export type LangSmithListRunsResult = typeof LangSmithListRunsResult.Type;

export const LangSmithRunDetailInput = Schema.Struct({ runId: TrimmedNonEmptyString });
export type LangSmithRunDetailInput = typeof LangSmithRunDetailInput.Type;

export const LangSmithChildRun = Schema.Struct({
  name: Schema.String,
  runType: Schema.String,
  depth: Schema.Number,
  failed: Schema.Boolean,
  latencyMs: Schema.NullOr(Schema.Number),
});

export const LangSmithRunDetail = Schema.Struct({
  ...LangSmithRunSummary.fields,
  url: Schema.String,
  error: Schema.String,
  /** Pretty-printed JSON, truncated server-side. */
  inputsJson: Schema.String,
  outputsJson: Schema.NullOr(Schema.String),
  children: Schema.Array(LangSmithChildRun),
});
export type LangSmithRunDetail = typeof LangSmithRunDetail.Type;
