import type { LinearIssueDetail } from "@t3tools/contracts";

import type { IssueDocument } from "../issues/issueContext";

export const LINEAR_PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

export function linearIssueDocument(issue: LinearIssueDetail): IssueDocument {
  const meta = [
    `**Status:** ${issue.state.name}`,
    `**Priority:** ${LINEAR_PRIORITY_LABELS[issue.priority] ?? "No priority"}`,
    `**Assignee:** ${issue.assignee?.name ?? "Unassigned"}`,
    issue.labels.length > 0
      ? `**Labels:** ${issue.labels.map((label) => label.name).join(", ")}`
      : null,
    issue.projectName ? `**Project:** ${issue.projectName}` : null,
    issue.cycleName ? `**Cycle:** ${issue.cycleName}` : null,
  ].filter((line): line is string => line !== null);
  const summary = [
    meta.join("  \n"),
    "## Description",
    issue.description.trim().length > 0 ? issue.description.trim() : "_No description._",
  ].join("\n\n");
  const body =
    issue.comments.length === 0
      ? ""
      : [
          "## Comments",
          ...issue.comments.map(
            (comment) => `**${comment.author}** · ${comment.createdAt}\n\n${comment.body.trim()}`,
          ),
        ].join("\n\n");
  return {
    source: "linear",
    identifier: issue.identifier,
    // Linear identifiers are TEAM-123, so the chip label never contains "/".
    chipLabel: `Linear ${issue.identifier}`,
    title: issue.title,
    url: issue.url,
    summary,
    body,
  };
}

export function linearTaskPrompt(issue: Pick<LinearIssueDetail, "identifier" | "title">): string {
  return `Work on Linear issue ${issue.identifier}: ${issue.title}. The issue is attached. Read the relevant code, propose a plan, then implement it.`;
}
