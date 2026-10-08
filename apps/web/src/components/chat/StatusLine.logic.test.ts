import { ServerProviderUsageWindow, ThreadPullRequestLink } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import type { ContextWindowSnapshot } from "~/lib/contextWindow";
import { deriveStatusLine, statusLineTone } from "./StatusLine.logic";

const NOW = Date.parse("2026-10-07T12:00:00.000Z");

function contextWindow(overrides: Partial<ContextWindowSnapshot> = {}): ContextWindowSnapshot {
  return {
    usedTokens: 0,
    totalProcessedTokens: null,
    maxTokens: null,
    remainingTokens: null,
    usedPercentage: null,
    remainingPercentage: null,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    lastUsedTokens: null,
    lastInputTokens: null,
    lastCachedInputTokens: null,
    lastOutputTokens: null,
    lastReasoningOutputTokens: null,
    toolUses: null,
    durationMs: null,
    compactsAutomatically: null,
    autoCompactThreshold: null,
    cost: null,
    updatedAt: "2026-10-07T12:00:00.000Z",
    ...overrides,
  };
}

const usageWindow = Schema.decodeUnknownSync(ServerProviderUsageWindow);
const pullRequestLink = Schema.decodeUnknownSync(ThreadPullRequestLink);

function linkWith(snapshot: Record<string, unknown> | null) {
  return pullRequestLink({
    host: "github.com",
    repository: "acme/app",
    number: 42,
    url: "https://github.com/acme/app/pull/42",
    source: "manual",
    linkedAt: "2026-10-01T00:00:00.000Z",
    stack: null,
    snapshot:
      snapshot === null
        ? null
        : {
            state: "open",
            title: "Add status line",
            headBranch: "feat/status-line",
            baseBranch: "main",
            isDraft: false,
            updatedAt: null,
            syncedAt: "2026-10-07T11:00:00.000Z",
            ...snapshot,
          },
  });
}

const EMPTY = {
  contextWindow: null,
  usageWindows: [],
  vcsStatus: null,
  pullRequest: null,
  now: NOW,
} as const;

describe("statusLineTone", () => {
  it("turns amber at half and red at 80%", () => {
    expect(statusLineTone(49)).toBe("ok");
    expect(statusLineTone(50)).toBe("warn");
    expect(statusLineTone(79)).toBe("warn");
    expect(statusLineTone(80)).toBe("high");
  });
});

describe("deriveStatusLine", () => {
  it("hides every segment when nothing is reported", () => {
    expect(deriveStatusLine(EMPTY)).toEqual({
      context: null,
      session: null,
      weekly: null,
      cacheHitPercent: null,
      workingTree: null,
      pullRequest: null,
    });
  });

  it("shows context only when the provider reports a window size", () => {
    expect(deriveStatusLine({ ...EMPTY, contextWindow: contextWindow() }).context).toBeNull();
    expect(
      deriveStatusLine({ ...EMPTY, contextWindow: contextWindow({ usedPercentage: 83.7 }) })
        .context,
    ).toEqual({ label: "ctx", usedPercent: 83, tone: "high", resetsIn: null });
  });

  it("uses the account-wide session and weekly windows with time to reset", () => {
    const line = deriveStatusLine({
      ...EMPTY,
      usageWindows: [
        usageWindow({
          id: "five_hour",
          kind: "session",
          label: "Session",
          usedPercent: 12.4,
          resetsAt: "2026-10-07T14:13:00.000Z",
          windowDurationMins: 300,
        }),
        usageWindow({ id: "seven_day", kind: "weekly", label: "Weekly", usedPercent: 55 }),
        usageWindow({
          id: "seven_day_opus",
          kind: "weekly",
          label: "Weekly · Opus",
          usedPercent: 90,
        }),
      ],
    });
    expect(line.session).toEqual({ label: "5h", usedPercent: 12, tone: "ok", resetsIn: "2h 13m" });
    expect(line.weekly).toEqual({ label: "wk", usedPercent: 55, tone: "warn", resetsIn: null });
  });

  it("computes the cache hit ratio from the latest request", () => {
    const live = contextWindow({ inputTokens: 1_000, cachedInputTokens: 925 });
    expect(deriveStatusLine({ ...EMPTY, contextWindow: live }).cacheHitPercent).toBe(92);

    const persisted = contextWindow({
      inputTokens: 50_000,
      cachedInputTokens: 10_000,
      lastInputTokens: 2_000,
      lastCachedInputTokens: 1_500,
    });
    expect(deriveStatusLine({ ...EMPTY, contextWindow: persisted }).cacheHitPercent).toBe(75);

    const noCacheData = contextWindow({ inputTokens: 1_000 });
    expect(deriveStatusLine({ ...EMPTY, contextWindow: noCacheData }).cacheHitPercent).toBeNull();
  });

  it("summarizes the working tree only when it has changes", () => {
    const workingTree = {
      files: [
        { path: "a.ts", insertions: 30, deletions: 2 },
        { path: "b.ts", insertions: 10, deletions: 10 },
      ],
      insertions: 40,
      deletions: 12,
    };
    expect(
      deriveStatusLine({
        ...EMPTY,
        vcsStatus: { hasWorkingTreeChanges: true, workingTree },
      }).workingTree,
    ).toEqual({ files: 2, insertions: 40, deletions: 12 });
    expect(
      deriveStatusLine({
        ...EMPTY,
        vcsStatus: { hasWorkingTreeChanges: false, workingTree: { ...workingTree, files: [] } },
      }).workingTree,
    ).toBeNull();
  });

  it("names the pull request's review state, with draft and terminal states first", () => {
    const stateOf = (snapshot: Record<string, unknown> | null) =>
      deriveStatusLine({ ...EMPTY, pullRequest: linkWith(snapshot) }).pullRequest?.state;
    expect(stateOf(null)).toBe("open");
    expect(stateOf({})).toBe("open");
    expect(stateOf({ reviewDecision: "approved" })).toBe("approved");
    expect(stateOf({ reviewDecision: "changes-requested" })).toBe("changes-requested");
    expect(stateOf({ isDraft: true, reviewDecision: "approved" })).toBe("draft");
    expect(stateOf({ state: "merged", reviewDecision: "approved" })).toBe("merged");
  });
});
