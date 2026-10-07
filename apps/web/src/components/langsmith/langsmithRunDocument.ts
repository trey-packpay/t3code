import type { LangSmithRunDetail } from "@t3tools/contracts";

import { formatReviewCommentFence } from "~/reviewCommentContext";

import { clampText, type IssueDocument } from "../issues/issueContext";

/** The server sends up to 32k of JSON per field; the panel and the agent get the head of it. */
const INPUT_OUTPUT_MAX_CHARS = 8_000;

export function formatLatency(ms: number | null): string {
  if (ms === null) return "running";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function langsmithRunDocument(run: LangSmithRunDetail): IssueDocument {
  const meta = [
    `**Run type:** ${run.runType}`,
    `**Started:** ${run.startTime}`,
    `**Latency:** ${formatLatency(run.latencyMs)}`,
    run.totalTokens !== null ? `**Tokens:** ${run.totalTokens}` : null,
  ].filter((line): line is string => line !== null);
  const summary = [
    meta.join("  \n"),
    "## Error",
    formatReviewCommentFence("", run.error || "(no error text)"),
  ].join("\n\n");
  const outline =
    run.children.length === 0
      ? ""
      : `## Trace outline\n\n${formatReviewCommentFence(
          "",
          run.children
            .map(
              (child) =>
                `${"  ".repeat(child.depth)}${child.failed ? "x" : "-"} ${child.name} [${child.runType}] ${formatLatency(child.latencyMs)}`,
            )
            .join("\n"),
        )}`;
  const body = [
    `## Inputs\n\n${formatReviewCommentFence("json", clampText(run.inputsJson, INPUT_OUTPUT_MAX_CHARS))}`,
    run.outputsJson !== null
      ? `## Outputs\n\n${formatReviewCommentFence("json", clampText(run.outputsJson, INPUT_OUTPUT_MAX_CHARS))}`
      : "",
    outline,
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
  return {
    source: "langsmith",
    identifier: run.id,
    // Run IDs are UUIDs, so the chip label never contains "/".
    chipLabel: `LangSmith run ${run.id.slice(0, 8)}`,
    title: run.name,
    url: run.url,
    summary,
    body,
  };
}

export function langsmithTaskPrompt(run: Pick<LangSmithRunDetail, "name">): string {
  return `Investigate this failed LangSmith run: ${run.name}. Inputs, outputs, and the error are attached. Find why it failed and fix it.`;
}
