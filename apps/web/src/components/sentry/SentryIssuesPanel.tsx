import type {
  EnvironmentId,
  ProjectId,
  SentryIssueFilter,
  SentryIssueSummary,
  SentryListIssuesInput,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useMemo, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { sentryEnvironment } from "~/state/sentry";
import { useDebouncedValue } from "~/state/queries";
import { serverEnvironment } from "~/state/server";
import { formatRelativeTimeLabel } from "~/timestampFormat";

import { IssuePageList, useIssuePages } from "../issues/IssuePagedList";
import { type IssueFilterOption, IssueListShell, IssueRow } from "../issues/IssuePanelChrome";
import { SENTRY_LEVEL_VARIANTS } from "./sentryIssueDocument";

const FILTERS: ReadonlyArray<IssueFilterOption<SentryIssueFilter>> = [
  { value: "unresolved", label: "Unresolved" },
  { value: "for_review", label: "For review" },
  { value: "all", label: "All" },
];

// The server asks Sentry for the last 14 days (statsPeriod=14d).
const EMPTY_MESSAGES: Record<SentryIssueFilter, string> = {
  unresolved: "No unresolved Sentry issues in the last 14 days.",
  for_review: "No Sentry issues for review in the last 14 days.",
  all: "No Sentry issues in the last 14 days.",
};

export interface SentryIssueTarget {
  readonly issueId: string;
  readonly shortId: string;
}

/** The project's mapped Sentry projects as a header chip: "web", or "2 projects". */
function useSentryScopeLabel(environmentId: EnvironmentId, projectId: ProjectId): string | null {
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(environmentId));
  if (settings === null) return null;
  const mapped = resolveProjectSettings(settings, projectId).settings.sentryProjects;
  return mapped.length > 1 ? `${mapped.length} projects` : (mapped[0]?.slug ?? null);
}

export function SentryIssuesPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly onOpenIssue: (target: SentryIssueTarget) => void;
}) {
  const [filter, setFilter] = useState<SentryIssueFilter>("unresolved");
  const [queryInput, setQueryInput] = useState("");
  const query = useDebouncedValue(queryInput.trim(), 300);
  const input = useMemo<SentryListIssuesInput>(
    () => ({ projectId: props.projectId, filter, ...(query.length > 0 ? { query } : {}) }),
    [filter, props.projectId, query],
  );
  const pages = useIssuePages(
    sentryEnvironment.issues,
    props.environmentId,
    input,
    sentryEnvironment.scope(props.environmentId, props.projectId),
  );
  const scopeLabel = useSentryScopeLabel(props.environmentId, props.projectId);

  return (
    <IssueListShell
      source="sentry"
      scopeLabel={scopeLabel}
      query={queryInput}
      onQueryChange={setQueryInput}
      filter={filter}
      filterOptions={FILTERS}
      onFilterChange={setFilter}
      refreshing={pages.refreshing}
      onRefresh={pages.refresh}
      error={pages.staleError}
      onRetry={pages.refresh}
    >
      <IssuePageList
        source="sentry"
        pages={pages}
        isEmpty={(page) => page.issues.length === 0}
        emptyMessage={
          query.length > 0
            ? `No issues match "${query}" in the last 14 days.`
            : EMPTY_MESSAGES[filter]
        }
        renderPage={(page) => (
          <SentryIssueRows issues={page.issues} onOpenIssue={props.onOpenIssue} />
        )}
      />
    </IssueListShell>
  );
}

function SentryIssueRows(props: {
  readonly issues: ReadonlyArray<SentryIssueSummary>;
  readonly onOpenIssue: (target: SentryIssueTarget) => void;
}) {
  return props.issues.map((issue) => (
    <IssueRow
      key={issue.id}
      onOpen={() => props.onOpenIssue({ issueId: issue.id, shortId: issue.shortId })}
      leading={
        <Badge size="sm" variant={SENTRY_LEVEL_VARIANTS[issue.level] ?? "secondary"}>
          {issue.level}
        </Badge>
      }
      title={issue.title}
      meta={
        <>
          <span className="font-mono">{issue.shortId}</span>
          {issue.culprit ? <span className="truncate">{issue.culprit}</span> : null}
          <span>{issue.count} events</span>
          <span>{issue.userCount} users</span>
          <span>{formatRelativeTimeLabel(issue.lastSeen)}</span>
        </>
      }
    />
  ));
}
