import type {
  EnvironmentId,
  LinearIssueFilter,
  LinearIssueSummary,
  LinearListIssuesInput,
  ProjectId,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useMemo, useState } from "react";

import { linearEnvironment } from "~/state/linear";
import { useDebouncedValue } from "~/state/queries";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { formatRelativeTimeLabel } from "~/timestampFormat";

import {
  type IssueFilterOption,
  IssueListShell,
  IssueListSkeleton,
  IssueRow,
  IssueTrackerStateView,
  LoadMoreButton,
} from "../issues/IssuePanelChrome";
import { LINEAR_PRIORITY_LABELS } from "./linearIssueDocument";

const FILTERS: ReadonlyArray<IssueFilterOption<LinearIssueFilter>> = [
  { value: "open", label: "Open" },
  { value: "mine", label: "Assigned to me" },
  { value: "all", label: "All" },
];

/** The project's mapped teams as a header chip: "ENG", or "2 teams". */
function useLinearScopeLabel(environmentId: EnvironmentId, projectId: ProjectId): string | null {
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(environmentId));
  const teams = useEnvironmentQuery(linearEnvironment.teams({ environmentId, input: {} }));
  if (settings === null || teams.data === null) return null;
  const mapped = new Set(resolveProjectSettings(settings, projectId).settings.linearTeamIds);
  const keys = teams.data.teams.filter((team) => mapped.has(team.id)).map((team) => team.key);
  return keys.length > 1 ? `${keys.length} teams` : (keys[0] ?? null);
}

export function LinearIssuesPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly onOpenIssue: (identifier: string) => void;
}) {
  const [filter, setFilter] = useState<LinearIssueFilter>("open");
  const [queryInput, setQueryInput] = useState("");
  const query = useDebouncedValue(queryInput.trim(), 300);
  const listKey = `${filter}|${query}`;
  // Later pages belong to one filter and query; a change starts from the first page again.
  const [more, setMore] = useState<{ key: string; cursors: ReadonlyArray<string> }>({
    key: "",
    cursors: [],
  });
  const cursors = more.key === listKey ? more.cursors : [];

  const baseInput = useMemo<LinearListIssuesInput>(
    () => ({ projectId: props.projectId, filter, ...(query.length > 0 ? { query } : {}) }),
    [filter, props.projectId, query],
  );
  const firstPage = useEnvironmentQuery(
    linearEnvironment.issues({ environmentId: props.environmentId, input: baseInput }),
  );
  const scopeLabel = useLinearScopeLabel(props.environmentId, props.projectId);

  const loadMore = (cursor: string) => setMore({ key: listKey, cursors: [...cursors, cursor] });
  const refresh = () => {
    setMore({ key: listKey, cursors: [] });
    firstPage.refresh();
  };
  const firstNextCursor = firstPage.data?.nextCursor ?? null;

  return (
    <IssueListShell
      source="linear"
      scopeLabel={scopeLabel}
      query={queryInput}
      onQueryChange={setQueryInput}
      filter={filter}
      filterOptions={FILTERS}
      onFilterChange={setFilter}
      refreshing={firstPage.isPending}
      onRefresh={refresh}
      // A failed refresh keeps the last good list below a one-line error.
      error={firstPage.data === null ? null : firstPage.error}
      onRetry={refresh}
    >
      {firstPage.data === null ? (
        firstPage.error !== null ? (
          <IssueTrackerStateView
            source="linear"
            failure={firstPage.failure}
            error={firstPage.error}
            onRetry={refresh}
          />
        ) : (
          <IssueListSkeleton />
        )
      ) : firstPage.data.issues.length === 0 ? (
        <IssueTrackerStateView
          source="linear"
          failure={null}
          error={null}
          emptyMessage={
            query.length > 0 ? `No issues match "${query}".` : "No issues for this filter."
          }
        />
      ) : (
        <>
          <LinearIssueRows issues={firstPage.data.issues} onOpenIssue={props.onOpenIssue} />
          {cursors.map((cursor, index) => (
            <LinearIssuePage
              key={cursor}
              environmentId={props.environmentId}
              input={{ ...baseInput, cursor }}
              isLast={index === cursors.length - 1}
              onOpenIssue={props.onOpenIssue}
              onLoadMore={loadMore}
            />
          ))}
          {cursors.length === 0 && firstNextCursor !== null ? (
            <LoadMoreButton loading={false} onClick={() => loadMore(firstNextCursor)} />
          ) : null}
        </>
      )}
    </IssueListShell>
  );
}

function LinearIssuePage(props: {
  readonly environmentId: EnvironmentId;
  readonly input: LinearListIssuesInput;
  readonly isLast: boolean;
  readonly onOpenIssue: (identifier: string) => void;
  readonly onLoadMore: (cursor: string) => void;
}) {
  const page = useEnvironmentQuery(
    linearEnvironment.issues({ environmentId: props.environmentId, input: props.input }),
  );
  if (page.data === null) {
    return <LoadMoreButton loading={page.error === null} onClick={page.refresh} />;
  }
  const nextCursor = page.data.nextCursor;
  return (
    <>
      <LinearIssueRows issues={page.data.issues} onOpenIssue={props.onOpenIssue} />
      {props.isLast && nextCursor !== null ? (
        <LoadMoreButton loading={false} onClick={() => props.onLoadMore(nextCursor)} />
      ) : null}
    </>
  );
}

function LinearIssueRows(props: {
  readonly issues: ReadonlyArray<LinearIssueSummary>;
  readonly onOpenIssue: (identifier: string) => void;
}) {
  return props.issues.map((issue) => (
    <IssueRow
      key={issue.id}
      onOpen={() => props.onOpenIssue(issue.identifier)}
      leading={
        // Data-driven status colour from Linear, not a restyle of a ui component.
        <span
          className="block size-2 rounded-full"
          style={{ backgroundColor: issue.state.color }}
        />
      }
      title={issue.title}
      meta={
        <>
          <span className="font-mono">{issue.identifier}</span>
          <span>{issue.state.name}</span>
          {issue.priority > 0 ? <span>{LINEAR_PRIORITY_LABELS[issue.priority]}</span> : null}
          <span>{issue.assignee?.name ?? "Unassigned"}</span>
          <span>{formatRelativeTimeLabel(issue.updatedAt)}</span>
        </>
      }
    />
  ));
}
