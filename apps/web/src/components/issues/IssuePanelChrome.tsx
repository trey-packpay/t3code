import {
  type EnvironmentId,
  IssueTrackerError,
  type IssueTrackerSource,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { ArrowUpRightIcon, CircleAlertIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";

import ChatMarkdown from "~/components/ChatMarkdown";
import { Alert, AlertAction, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { readLocalApi } from "~/localApi";

import { ISSUE_SOURCE_LABELS } from "./issueContext";
import { ISSUE_TRACKER_ICONS } from "./issueTrackerIcons";

const isIssueTrackerError = Schema.is(IssueTrackerError);

export interface IssueFilterOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export function openIssueUrl(url: string) {
  void readLocalApi()?.shell.openExternal(url);
}

/** A refresh that failed while data is already shown: the content stays below it. */
function IssueInlineError(props: {
  readonly error: string;
  readonly onRetry: (() => void) | undefined;
}) {
  return (
    <div className="border-b border-border/60 px-2 py-1.5">
      <Alert variant="error" role="status" aria-live="polite">
        <CircleAlertIcon />
        <AlertDescription>
          <span className="truncate">{props.error}</span>
        </AlertDescription>
        {props.onRetry ? (
          <AlertAction>
            <Button size="xs" variant="outline" onClick={props.onRetry}>
              Retry
            </Button>
          </AlertAction>
        ) : null}
      </Alert>
    </div>
  );
}

export function IssueListShell<T extends string>(props: {
  readonly source: IssueTrackerSource;
  readonly scopeLabel: string | null;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly filter: T;
  readonly filterOptions: ReadonlyArray<IssueFilterOption<T>>;
  readonly onFilterChange: (filter: T) => void;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly error?: string | null | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const Icon = ISSUE_TRACKER_ICONS[props.source];
  const items = Object.fromEntries(
    props.filterOptions.map((option) => [option.value, option.label]),
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium">{ISSUE_SOURCE_LABELS[props.source]}</span>
        {props.scopeLabel ? (
          <span className="min-w-0 truncate text-2xs text-muted-foreground">
            {props.scopeLabel}
          </span>
        ) : null}
        <Button
          className="ml-auto"
          size="icon-xs"
          variant="ghost"
          aria-label="Refresh"
          disabled={props.refreshing}
          onClick={props.onRefresh}
        >
          <RefreshIcon refreshing={props.refreshing} />
        </Button>
      </header>
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2 py-1.5">
        <InputGroup className="min-w-0 flex-1">
          <InputGroupAddon>
            <SearchIcon aria-hidden className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            size="sm"
            type="search"
            aria-label="Search"
            placeholder="Search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.currentTarget.value)}
          />
        </InputGroup>
        <Select
          value={props.filter}
          items={items}
          onValueChange={(value) => {
            const option = props.filterOptions.find((entry) => entry.value === value);
            if (option) props.onFilterChange(option.value);
          }}
        >
          <SelectTrigger size="sm" aria-label="Filter">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {props.filterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      {props.error ? <IssueInlineError error={props.error} onRetry={props.onRetry} /> : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col p-1.5">{props.children}</div>
      </ScrollArea>
    </div>
  );
}

export function IssueRow(props: {
  readonly leading: ReactNode;
  readonly title: string;
  readonly meta: ReactNode;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onOpen}
      className="flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      <span className="mt-0.5 shrink-0">{props.leading}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-xs">{props.title}</span>
        <span className="flex min-w-0 items-center gap-1.5 truncate text-2xs text-muted-foreground">
          {props.meta}
        </span>
      </span>
    </button>
  );
}

export function IssueListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function LoadMoreButton(props: { readonly loading: boolean; readonly onClick: () => void }) {
  return (
    <Button
      className="mx-auto my-1.5"
      size="xs"
      variant="ghost"
      disabled={props.loading}
      onClick={props.onClick}
    >
      {props.loading ? "Loading..." : "Load more"}
    </Button>
  );
}

const SCOPE_NOUNS: Record<IssueTrackerSource, string> = {
  linear: "Linear teams",
  sentry: "Sentry projects",
  langsmith: "LangSmith projects",
};

/** The panel body for failures and empty results. `failure` is the query's typed failure. */
export function IssueTrackerStateView(props: {
  readonly source: IssueTrackerSource;
  readonly failure: unknown;
  readonly error: string | null;
  readonly emptyMessage?: string;
  readonly onRetry?: () => void;
}) {
  const navigate = useNavigate();
  const label = ISSUE_SOURCE_LABELS[props.source];
  const Icon = ISSUE_TRACKER_ICONS[props.source];
  const reason = isIssueTrackerError(props.failure) ? props.failure.reason : null;
  const upstream = isIssueTrackerError(props.failure) ? props.failure.upstreamMessage : undefined;
  const openSettings = () => void navigate({ to: "/settings/integrations" });

  const view =
    reason === "not-configured"
      ? {
          title: `Connect ${label}`,
          description: `Add a ${label} token in Settings > Integrations.`,
          action: "settings" as const,
        }
      : reason === "no-mapping"
        ? {
            title: `Choose ${SCOPE_NOUNS[props.source]}`,
            description: `Pick which ${SCOPE_NOUNS[props.source]} belong to this project in Settings > Integrations.`,
            action: "settings" as const,
          }
        : reason === "unauthorized"
          ? {
              title: `${label} rejected the token`,
              description: upstream ?? "Check the token in Settings > Integrations.",
              action: "settings" as const,
            }
          : props.error !== null
            ? {
                title: `Could not load ${label}`,
                description: upstream ?? props.error,
                action: "retry" as const,
              }
            : {
                title: "Nothing here",
                description: props.emptyMessage ?? "No results.",
                action: null,
              };

  return (
    <Empty className="min-h-0 justify-center-safe overflow-y-auto">
      <EmptyMedia variant="icon">
        <Icon />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{view.title}</EmptyTitle>
        <EmptyDescription>{view.description}</EmptyDescription>
      </EmptyHeader>
      {view.action === "settings" ? (
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={openSettings}>
            Open settings
          </Button>
        </EmptyContent>
      ) : view.action === "retry" && props.onRetry ? (
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={props.onRetry}>
            Retry
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export function IssueTrackerDesktopOnlyState() {
  return (
    <Empty className="min-h-0 justify-center-safe">
      <EmptyHeader>
        <EmptyTitle>Desktop only</EmptyTitle>
        <EmptyDescription>
          Issue trackers are only available in the T3 Code desktop app.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function IssueDetailShell(props: {
  readonly source: IssueTrackerSource;
  readonly identifier: string;
  readonly title: string;
  readonly url: string;
  readonly badges: ReactNode;
  readonly actions: ReactNode;
  readonly markdown: string;
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly error?: string | null | undefined;
  readonly onRetry?: (() => void) | undefined;
}) {
  const Icon = ISSUE_TRACKER_ICONS[props.source];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-1.5 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-mono text-2xs text-muted-foreground">{props.identifier}</span>
          <div className="flex min-w-0 items-center gap-1">{props.badges}</div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Refresh"
              disabled={props.refreshing}
              onClick={props.onRefresh}
            >
              <RefreshIcon refreshing={props.refreshing} />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Open in ${ISSUE_SOURCE_LABELS[props.source]}`}
              onClick={() => openIssueUrl(props.url)}
            >
              <ArrowUpRightIcon className="size-3.5" />
            </Button>
            {props.actions}
          </div>
        </div>
        <h2 className="text-sm leading-snug font-medium">{props.title}</h2>
      </header>
      {props.error ? <IssueInlineError error={props.error} onRetry={props.onRetry} /> : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 py-2">
          <ChatMarkdown
            text={props.markdown}
            cwd={undefined}
            environmentId={props.environmentId}
            threadRef={props.threadRef ?? undefined}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
