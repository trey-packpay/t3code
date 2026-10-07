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

import { IssuePageList, useIssuePages } from "../issues/IssuePagedList";
import { type IssueFilterOption, IssueListShell, IssueRow } from "../issues/IssuePanelChrome";
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
  const input = useMemo<LinearListIssuesInput>(
    () => ({ projectId: props.projectId, filter, ...(query.length > 0 ? { query } : {}) }),
    [filter, props.projectId, query],
  );
  const pages = useIssuePages(linearEnvironment.issues, props.environmentId, input);
  const scopeLabel = useLinearScopeLabel(props.environmentId, props.projectId);

  return (
    <IssueListShell
      source="linear"
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
        source="linear"
        pages={pages}
        isEmpty={(page) => page.issues.length === 0}
        emptyMessage={
          query.length > 0 ? `No issues match "${query}".` : "No issues for this filter."
        }
        renderPage={(page) => (
          <LinearIssueRows issues={page.issues} onOpenIssue={props.onOpenIssue} />
        )}
      />
    </IssueListShell>
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
