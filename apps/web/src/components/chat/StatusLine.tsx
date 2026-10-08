import type {
  ScopedThreadRef,
  ServerProviderUsageWindow,
  ThreadPullRequestLink,
  VcsStatusResult,
} from "@t3tools/contracts";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/shared/threadPullRequests";
import { FileDiffIcon } from "lucide-react";
import { memo, useMemo, type MouseEvent, type ReactNode } from "react";

import { isElectron } from "~/env";
import { useNowMinute } from "~/hooks/useNowMinute";
import { useClientSettings } from "~/hooks/useSettings";
import type { ContextWindowSnapshot } from "~/lib/contextWindow";
import { useOpenPrLink } from "~/lib/openPullRequestLink";
import { cn } from "~/lib/utils";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { InlineButton } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  deriveStatusLine,
  type StatusLineMeter,
  type StatusLineModel,
  type StatusLinePullRequestState,
  type StatusLineTone,
} from "./StatusLine.logic";

const TONE_TEXT: Record<StatusLineTone, string> = {
  ok: "",
  warn: "text-warning",
  high: "text-destructive",
};

const TONE_FILL: Record<StatusLineTone, string> = {
  ok: "bg-muted-foreground/60",
  warn: "bg-warning",
  high: "bg-destructive",
};

const PULL_REQUEST_STATE: Record<
  StatusLinePullRequestState,
  { readonly label: string; readonly className: string } | null
> = {
  open: null,
  approved: { label: "approved", className: "text-success" },
  "changes-requested": { label: "changes requested", className: "text-warning" },
  "review-required": { label: "in review", className: "" },
  draft: { label: "draft", className: "text-muted-foreground/70" },
  merged: { label: "merged", className: "" },
  closed: { label: "closed", className: "text-muted-foreground/70" },
};

function Segment(props: { readonly tooltip: string; readonly children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex shrink-0 items-center gap-1" />}>
        {props.children}
      </TooltipTrigger>
      <TooltipPopup side="top">{props.tooltip}</TooltipPopup>
    </Tooltip>
  );
}

function MeterSegment(props: { readonly meter: StatusLineMeter; readonly tooltip: string }) {
  const { meter } = props;
  return (
    <Segment tooltip={props.tooltip}>
      <span>{meter.label}</span>
      <span
        aria-hidden="true"
        className="relative h-1 w-6 overflow-hidden rounded-full bg-muted-foreground/20"
      >
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", TONE_FILL[meter.tone])}
          style={{ width: `${meter.usedPercent}%` }}
        />
      </span>
      <span className={TONE_TEXT[meter.tone]}>{meter.usedPercent}%</span>
      {meter.resetsIn !== null ? (
        <span className="text-muted-foreground/60">{meter.resetsIn}</span>
      ) : null}
    </Segment>
  );
}

function limitTooltip(name: string, meter: StatusLineMeter): string {
  return `${name}: ${meter.usedPercent}% used${meter.resetsIn ? ` · resets in ${meter.resetsIn}` : ""}`;
}

/**
 * One muted line under the desktop composer, read like a terminal status line:
 * context, subscription limits, cache hits, working tree, and PR review state.
 * Segments the provider or thread cannot report are left out.
 */
export function StatusLine(props: {
  readonly model: StatusLineModel;
  readonly onOpenPullRequest: (event: MouseEvent<HTMLElement>, url: string) => void;
}) {
  const { context, session, weekly, cacheHitPercent, workingTree, pullRequest } = props.model;
  const segments: Array<{ readonly key: string; readonly node: ReactNode }> = [];

  if (context) {
    segments.push({
      key: "context",
      node: (
        <MeterSegment meter={context} tooltip={`Context window: ${context.usedPercent}% used`} />
      ),
    });
  }
  if (session) {
    segments.push({
      key: "session",
      node: <MeterSegment meter={session} tooltip={limitTooltip("Session limit", session)} />,
    });
  }
  if (weekly) {
    segments.push({
      key: "weekly",
      node: <MeterSegment meter={weekly} tooltip={limitTooltip("Weekly limit", weekly)} />,
    });
  }
  if (cacheHitPercent !== null) {
    segments.push({
      key: "cache",
      node: (
        <Segment
          tooltip={`${cacheHitPercent}% of the latest request's input was read from the prompt cache`}
        >
          <span>cache</span>
          <span>{cacheHitPercent}% hit</span>
        </Segment>
      ),
    });
  }
  if (workingTree) {
    segments.push({
      key: "working-tree",
      node: (
        <Segment
          tooltip={`${workingTree.files} uncommitted ${workingTree.files === 1 ? "file" : "files"}`}
        >
          <FileDiffIcon aria-hidden="true" />
          <span>{workingTree.files}</span>
          <span className="text-success">+{workingTree.insertions}</span>
          <span className="text-destructive">−{workingTree.deletions}</span>
        </Segment>
      ),
    });
  }
  if (pullRequest) {
    const state = PULL_REQUEST_STATE[pullRequest.state];
    segments.push({
      key: "pull-request",
      node: (
        <span className="inline-flex shrink-0 items-center gap-1">
          <InlineButton
            tone="muted"
            render={<a href={pullRequest.url} />}
            onClick={(event) => props.onOpenPullRequest(event, pullRequest.url)}
          >
            <PullRequestGlyph.pullRequest aria-hidden="true" />#{pullRequest.number}
          </InlineButton>
          {state ? <span className={state.className}>{state.label}</span> : null}
        </span>
      ),
    });
  }

  if (segments.length === 0) return null;
  return (
    <div
      data-chat-status-line="true"
      className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap px-3 text-2xs text-muted-foreground tabular-nums [&_svg]:size-3 [&_svg]:shrink-0"
    >
      {segments.map(({ key, node }, index) => (
        <span key={key} className="inline-flex shrink-0 items-center gap-2">
          {index > 0 ? <span aria-hidden="true" className="h-2.5 w-px bg-border" /> : null}
          {node}
        </span>
      ))}
    </div>
  );
}

const EMPTY_USAGE_WINDOWS: readonly ServerProviderUsageWindow[] = [];
const selectStatusLineEnabled = (settings: { statusLineEnabled: boolean }) =>
  settings.statusLineEnabled;

interface ChatStatusLineProps {
  readonly threadRef: ScopedThreadRef | null;
  readonly contextWindow: ContextWindowSnapshot | null;
  readonly usageWindows: readonly ServerProviderUsageWindow[] | undefined;
  readonly vcsStatus: VcsStatusResult | null | undefined;
  /** The thread's raw links; dismissed stack layers are filtered here. */
  readonly pullRequests: readonly ThreadPullRequestLink[] | undefined;
}

// Memoized so a streaming ChatView re-render with unchanged inputs skips the line.
const ConnectedStatusLine = memo(function ConnectedStatusLine(props: ChatStatusLineProps) {
  const { threadRef, contextWindow, usageWindows, vcsStatus, pullRequests } = props;
  // Reset countdowns only need minute precision; one shared timer feeds every consumer.
  const nowMinute = useNowMinute();
  const openPrLink = useOpenPrLink(threadRef ?? undefined);
  const model = useMemo(
    () =>
      deriveStatusLine({
        contextWindow,
        usageWindows: usageWindows ?? EMPTY_USAGE_WINDOWS,
        vcsStatus: vcsStatus ?? null,
        pullRequest: resolveThreadCurrentPullRequestLink(pullRequests ?? []),
        now: Date.parse(`${nowMinute}Z`),
      }),
    [contextWindow, nowMinute, pullRequests, usageWindows, vcsStatus],
  );
  return <StatusLine model={model} onOpenPullRequest={openPrLink} />;
});

/** The active thread's status line; renders nothing outside the desktop app or when turned off. */
export function ChatStatusLine(props: ChatStatusLineProps) {
  const enabled = useClientSettings(selectStatusLineEnabled);
  if (!isElectron || !enabled) return null;
  return <ConnectedStatusLine {...props} />;
}
