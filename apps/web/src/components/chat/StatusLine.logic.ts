import type {
  PullRequestReviewDecision,
  ServerProviderUsageWindow,
  ThreadPullRequestLink,
  VcsStatusLocalResult,
} from "@t3tools/contracts";
import { formatDuration } from "@t3tools/shared/usageLimits";

import type { ContextWindowSnapshot } from "~/lib/contextWindow";

export type StatusLineTone = "ok" | "warn" | "high";

export interface StatusLineMeter {
  /** Terse terminal-style label: `ctx`, `5h`, `wk`. */
  readonly label: string;
  readonly usedPercent: number;
  readonly tone: StatusLineTone;
  /** Compact time until the window resets, e.g. `2h 13m`; null when unknown. */
  readonly resetsIn: string | null;
}

export type StatusLinePullRequestState =
  | PullRequestReviewDecision
  | "draft"
  | "open"
  | "merged"
  | "closed";

export interface StatusLineModel {
  readonly context: StatusLineMeter | null;
  readonly session: StatusLineMeter | null;
  readonly weekly: StatusLineMeter | null;
  readonly cacheHitPercent: number | null;
  readonly workingTree: {
    readonly files: number;
    readonly insertions: number;
    readonly deletions: number;
  } | null;
  readonly pullRequest: {
    readonly number: number;
    readonly url: string;
    readonly state: StatusLinePullRequestState;
  } | null;
}

/** Same thresholds as a terminal status line: amber from half, red from 80%. */
export function statusLineTone(usedPercent: number): StatusLineTone {
  if (usedPercent >= 80) return "high";
  if (usedPercent >= 50) return "warn";
  return "ok";
}

function meter(label: string, usedPercent: number, resetsIn: string | null): StatusLineMeter {
  const clamped = Math.floor(Math.max(0, Math.min(100, usedPercent)));
  return { label, usedPercent: clamped, tone: statusLineTone(clamped), resetsIn };
}

/** `5h` for Claude's and Codex's session windows; the kind when the length is unknown or odd. */
function windowLabel(window: ServerProviderUsageWindow): string {
  if (window.kind === "weekly") return "wk";
  const minutes = window.windowDurationMins;
  return minutes !== undefined && minutes > 0 && minutes % 60 === 0
    ? `${minutes / 60}h`
    : window.kind;
}

/**
 * The first window of a kind is the account-wide one: providers list scoped
 * windows such as Claude's per-model weekly allowance after it.
 */
function windowMeter(
  windows: readonly ServerProviderUsageWindow[],
  kind: ServerProviderUsageWindow["kind"],
  now: number,
): StatusLineMeter | null {
  const window = windows.find((candidate) => candidate.kind === kind);
  if (!window) return null;
  const resetsAt = window.resetsAt === undefined ? Number.NaN : Date.parse(window.resetsAt);
  return meter(
    windowLabel(window),
    window.usedPercent,
    Number.isFinite(resetsAt) ? formatDuration(Math.max(0, resetsAt - now)) : null,
  );
}

/**
 * Share of the latest request's input served from the prompt cache. Live usage
 * reports per-request totals; a persisted snapshot keeps them in `last*`.
 */
function cacheHitPercent(usage: ContextWindowSnapshot): number | null {
  const [input, cached] =
    usage.lastInputTokens != null
      ? [usage.lastInputTokens, usage.lastCachedInputTokens]
      : [usage.inputTokens, usage.cachedInputTokens];
  if (input == null || cached == null || input <= 0) return null;
  return Math.floor(Math.min(100, (cached / input) * 100));
}

function pullRequestState(link: ThreadPullRequestLink): StatusLinePullRequestState {
  const snapshot = link.snapshot;
  if (snapshot === null) return "open";
  if (snapshot.state !== "open") return snapshot.state;
  if (snapshot.isDraft) return "draft";
  return snapshot.reviewDecision ?? "open";
}

/** Each segment is null when the active provider or thread has nothing to report. */
export function deriveStatusLine(input: {
  readonly contextWindow: ContextWindowSnapshot | null;
  readonly usageWindows: readonly ServerProviderUsageWindow[];
  readonly vcsStatus: Pick<VcsStatusLocalResult, "hasWorkingTreeChanges" | "workingTree"> | null;
  readonly pullRequest: ThreadPullRequestLink | null;
  readonly now: number;
}): StatusLineModel {
  const { contextWindow, usageWindows, vcsStatus, pullRequest, now } = input;
  return {
    context:
      contextWindow?.usedPercentage != null
        ? meter("ctx", contextWindow.usedPercentage, null)
        : null,
    session: windowMeter(usageWindows, "session", now),
    weekly: windowMeter(usageWindows, "weekly", now),
    cacheHitPercent: contextWindow ? cacheHitPercent(contextWindow) : null,
    workingTree:
      vcsStatus?.hasWorkingTreeChanges === true
        ? {
            files: vcsStatus.workingTree.files.length,
            insertions: vcsStatus.workingTree.insertions,
            deletions: vcsStatus.workingTree.deletions,
          }
        : null,
    pullRequest: pullRequest
      ? { number: pullRequest.number, url: pullRequest.url, state: pullRequestState(pullRequest) }
      : null,
  };
}
