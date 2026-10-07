import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { IssueTrackerErrorReason } from "@t3tools/contracts";

const REQUEST_TIMEOUT = "20 seconds";
const ERROR_BODY_MAX_CHARS = 300;
const AUTH_FAILURE_PATTERN = /authenticat|unauthori[sz]ed|invalid (api )?(key|token)/i;

/** A failed issue tracker request, classified; each service maps it to `IssueTrackerError`. */
export class IssueTrackerHttpFailure extends Schema.TaggedError<IssueTrackerHttpFailure>()(
  "IssueTrackerHttpFailure",
  {
    reason: IssueTrackerErrorReason,
    upstreamMessage: Schema.optional(Schema.String),
  },
) {}

const reasonFor = (status: number, body: string): IssueTrackerErrorReason => {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate-limited";
  if (status === 404) return "not-found";
  // Linear answers a bad key with HTTP 400 and a GraphQL error.
  if (status === 400 && AUTH_FAILURE_PATTERN.test(body)) return "unauthorized";
  return "upstream";
};

const classify = <S extends Schema.Top>(
  response: HttpClientResponse.HttpClientResponse,
  schema: S,
) =>
  Effect.gen(function* () {
    if (response.status >= 200 && response.status < 300) {
      const value = yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
        Effect.mapError(
          (error) =>
            new IssueTrackerHttpFailure({
              reason: "upstream",
              upstreamMessage:
                error._tag === "HttpClientError"
                  ? "The response could not be read."
                  : "The service returned data T3 Code could not read.",
            }),
        ),
      );
      return { value, headers: response.headers as Record<string, string> };
    }
    const body = yield* response.text.pipe(Effect.orElseSucceed(() => ""));
    return yield* new IssueTrackerHttpFailure({
      reason: reasonFor(response.status, body),
      upstreamMessage: body.slice(0, ERROR_BODY_MAX_CHARS) || `HTTP ${response.status}`,
    });
  });

/** Sends one JSON request. The caller sets auth headers; tokens never reach errors or spans. */
export const executeJson = <S extends Schema.Top>(
  httpClient: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: S,
) =>
  httpClient
    .execute(
      request.pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.setHeader("user-agent", "t3code"),
      ),
    )
    .pipe(
      Effect.timeout(REQUEST_TIMEOUT),
      Effect.mapError(
        () =>
          new IssueTrackerHttpFailure({
            reason: "upstream",
            upstreamMessage: "Could not reach the service.",
          }),
      ),
      Effect.flatMap((response) => classify(response, schema)),
      // Request URLs can carry search terms; keep them out of client spans.
      Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
    );
