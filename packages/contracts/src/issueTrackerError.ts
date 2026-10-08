import * as Schema from "effect/Schema";

export const IssueTrackerSource = Schema.Literals(["linear", "sentry", "langsmith"]);
export type IssueTrackerSource = typeof IssueTrackerSource.Type;

export const IssueTrackerErrorReason = Schema.Literals([
  "not-configured",
  "no-mapping",
  "unauthorized",
  "rate-limited",
  "not-found",
  "upstream",
]);
export type IssueTrackerErrorReason = typeof IssueTrackerErrorReason.Type;

const SOURCE_LABELS: Record<IssueTrackerSource, string> = {
  linear: "Linear",
  sentry: "Sentry",
  langsmith: "LangSmith",
};

/** Every failure an issue tracker RPC can report; `reason` drives which empty state the panel shows. */
export class IssueTrackerError extends Schema.TaggedError<IssueTrackerError>()(
  "IssueTrackerError",
  {
    source: IssueTrackerSource,
    reason: IssueTrackerErrorReason,
    /** The service's own error text, bounded server-side. Never contains the token. */
    upstreamMessage: Schema.optional(Schema.String),
  },
) {
  override get message(): string {
    const label = SOURCE_LABELS[this.source];
    switch (this.reason) {
      case "not-configured":
        return `${label} is not connected. Add a token in Settings.`;
      case "no-mapping":
        return `This project has no ${label} scope selected.`;
      case "unauthorized":
        return `${label} rejected the token.`;
      case "rate-limited":
        return `${label} rate limit reached. Try again shortly.`;
      case "not-found":
        return `${label} could not find that item.`;
      case "upstream":
        return `${label} request failed.`;
    }
  }
}
