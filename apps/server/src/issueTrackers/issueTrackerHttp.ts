import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { IssueTrackerErrorReason } from "@t3tools/contracts";

const REQUEST_TIMEOUT = "20 seconds";
export const ERROR_BODY_MAX_CHARS = 300;
const AUTH_FAILURE_PATTERN = /authenticat|unauthori[sz]ed|invalid (api )?(key|token)/i;
const HEADER_SAFE = /^[\x21-\x7e]+$/u;

/** Visible ASCII only; empty keys and redacted settings markers are unusable headers. */
export const isHeaderSafeToken = (token: string): boolean => HEADER_SAFE.test(token);

/** A failed issue tracker request, classified; each service maps it to `IssueTrackerError`. */
export class IssueTrackerHttpFailure extends Schema.TaggedError<IssueTrackerHttpFailure>()(
  "IssueTrackerHttpFailure",
  {
    reason: IssueTrackerErrorReason,
    upstreamMessage: Schema.optional(Schema.String),
  },
) {}

/** Classifies an upstream error body or message, including GraphQL error codes. */
export const classifyIssueTrackerError = (
  body: string,
  status?: number,
): IssueTrackerErrorReason => {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate-limited";
  if (status === 404) return "not-found";
  if (AUTH_FAILURE_PATTERN.test(body)) return "unauthorized";
  if (/rate ?limit/i.test(body)) return "rate-limited";
  if (/entity not found/i.test(body)) return "not-found";
  return "upstream";
};

const reasonFor = (status: number, body: string): IssueTrackerErrorReason =>
  classifyIssueTrackerError(body, status);

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
      Effect.flatMap((response) => classify(response, schema)),
      Effect.timeout(REQUEST_TIMEOUT),
      // Log only the failure kind (e.g. TransportError or TimeoutError): URLs, headers, and
      // bodies can carry tokens or search terms.
      Effect.tapError((error) =>
        error._tag === "IssueTrackerHttpFailure"
          ? Effect.void
          : Effect.logDebug("Issue tracker request did not complete", {
              failure: error._tag === "HttpClientError" ? error.reason._tag : error._tag,
            }),
      ),
      Effect.mapError((error) =>
        error._tag === "IssueTrackerHttpFailure"
          ? error
          : new IssueTrackerHttpFailure({
              reason: "upstream",
              upstreamMessage: "Could not reach the service.",
            }),
      ),
      // Request URLs can carry search terms; keep them out of client spans.
      Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
    );
