import type { SentryIssueDetail } from "@t3tools/contracts";

import { formatReviewCommentFence } from "~/reviewCommentContext";

import { type IssueDocument, markdownInlineCode } from "../issues/issueContext";

function stackTraceMarkdown(detail: SentryIssueDetail): string {
  if (detail.exceptions.length === 0) return "";
  return detail.exceptions
    .map((exception) => {
      const frames = exception.frames
        .map((frame) => {
          const location = `${frame.filename ?? "<unknown>"}:${frame.lineNo ?? "?"}`;
          const head = `  at ${frame.function ?? "<anonymous>"} (${location})${frame.inApp ? "" : " [library]"}`;
          const context = frame.context
            .map((line) => `      ${line.lineNo} | ${line.line}`)
            .join("\n");
          return context.length > 0 ? `${head}\n${context}` : head;
        })
        .join("\n");
      // Upstream text is untrusted markdown: keep it in code spans and fences.
      const value = exception.value.includes("\n")
        ? formatReviewCommentFence("", exception.value)
        : markdownInlineCode(exception.value);
      return [
        `### ${markdownInlineCode(exception.type)}`,
        value,
        formatReviewCommentFence("", frames),
      ]
        .filter((part) => part.length > 0)
        .join("\n\n");
    })
    .join("\n\n");
}

export function sentryIssueDocument(detail: SentryIssueDetail): IssueDocument {
  const meta = [
    `**Level:** ${detail.level}`,
    `**Status:** ${detail.status}`,
    `**Events:** ${detail.count} · **Users:** ${detail.userCount}`,
    `**First seen:** ${detail.firstSeen} · **Last seen:** ${detail.lastSeen}`,
    `**Project:** ${detail.projectSlug}`,
    detail.release ? `**Release:** ${detail.release}` : null,
    detail.environment ? `**Environment:** ${detail.environment}` : null,
    detail.culprit ? `**Culprit:** ${markdownInlineCode(detail.culprit)}` : null,
  ].filter((line): line is string => line !== null);
  const headline = detail.exceptions[0];
  const summary = [
    meta.join("  \n"),
    headline
      ? `## Error\n\n${markdownInlineCode(`${headline.type}: ${headline.value}`)}`
      : "## Error\n\n_No exception data on the latest event._",
  ].join("\n\n");
  const tags =
    detail.tags.length === 0
      ? ""
      : `## Tags\n\n${detail.tags
          .map((tag) => `- ${markdownInlineCode(tag.key)}: ${markdownInlineCode(tag.value)}`)
          .join("\n")}`;
  const breadcrumbs =
    detail.breadcrumbs.length === 0
      ? ""
      : `## Breadcrumbs (latest ${detail.breadcrumbs.length})\n\n${formatReviewCommentFence(
          "",
          detail.breadcrumbs
            .map((crumb) =>
              `${crumb.timestamp ?? ""} [${crumb.level ?? "info"}] ${crumb.category ?? ""} ${crumb.message ?? ""}`.trim(),
            )
            .join("\n"),
        )}`;
  const stack = stackTraceMarkdown(detail);
  const body = [
    stack.length > 0 ? `## Stack trace (latest event)\n\n${stack}` : "",
    tags,
    breadcrumbs,
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
  return {
    source: "sentry",
    identifier: detail.shortId,
    // Sentry short IDs are PROJECT-1A, so the chip label never contains "/".
    chipLabel: `Sentry ${detail.shortId}`,
    title: detail.title,
    url: detail.permalink,
    summary,
    body,
  };
}

export function sentryTaskPrompt(detail: Pick<SentryIssueDetail, "shortId" | "title">): string {
  return `Investigate Sentry issue ${detail.shortId}: ${detail.title}. The stack trace and event details are attached. Find the root cause and fix it.`;
}

export const SENTRY_LEVEL_VARIANTS: Record<string, "error" | "warning" | "info" | "secondary"> = {
  fatal: "error",
  error: "error",
  warning: "warning",
  info: "info",
  debug: "secondary",
};
