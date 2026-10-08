import type {
  EnvironmentId,
  LangSmithListRunsInput,
  LangSmithRunSummary,
  LangSmithRunWindow,
  ProjectId,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useMemo, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { langsmithEnvironment } from "~/state/langsmith";
import { useDebouncedValue } from "~/state/queries";
import { serverEnvironment } from "~/state/server";
import { formatRelativeTimeLabel } from "~/timestampFormat";

import { IssuePageList, useIssuePages } from "../issues/IssuePagedList";
import { type IssueFilterOption, IssueListShell, IssueRow } from "../issues/IssuePanelChrome";
import { formatLatency } from "./langsmithRunDocument";

const WINDOWS: ReadonlyArray<IssueFilterOption<LangSmithRunWindow>> = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export interface LangSmithRunTarget {
  readonly runId: string;
  readonly name: string;
}

/** The project's mapped LangSmith projects as a header chip: "agent-prod", or "2 projects". */
function useLangSmithScopeLabel(environmentId: EnvironmentId, projectId: ProjectId): string | null {
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(environmentId));
  if (settings === null) return null;
  const mapped = resolveProjectSettings(settings, projectId).settings.langsmithProjects;
  return mapped.length > 1 ? `${mapped.length} projects` : (mapped[0]?.name ?? null);
}

export function LangSmithRunsPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly onOpenRun: (target: LangSmithRunTarget) => void;
}) {
  const [runWindow, setRunWindow] = useState<LangSmithRunWindow>("7d");
  const [queryInput, setQueryInput] = useState("");
  const query = useDebouncedValue(queryInput.trim(), 300);
  const input = useMemo<LangSmithListRunsInput>(
    () => ({
      projectId: props.projectId,
      window: runWindow,
      ...(query.length > 0 ? { query } : {}),
    }),
    [props.projectId, query, runWindow],
  );
  const pages = useIssuePages(
    langsmithEnvironment.runs,
    props.environmentId,
    input,
    langsmithEnvironment.scope(props.environmentId, props.projectId),
  );
  const scopeLabel = useLangSmithScopeLabel(props.environmentId, props.projectId);
  const windowLabel = WINDOWS.find((option) => option.value === runWindow)?.label.toLowerCase();

  return (
    <IssueListShell
      source="langsmith"
      scopeLabel={scopeLabel}
      query={queryInput}
      onQueryChange={setQueryInput}
      filter={runWindow}
      filterOptions={WINDOWS}
      onFilterChange={setRunWindow}
      refreshing={pages.refreshing}
      onRefresh={pages.refresh}
      error={pages.staleError}
      onRetry={pages.refresh}
    >
      <IssuePageList
        source="langsmith"
        pages={pages}
        isEmpty={(page) => page.runs.length === 0}
        emptyMessage={
          query.length > 0
            ? `No failed runs match "${query}" in the ${windowLabel}.`
            : `No failed runs in the ${windowLabel}.`
        }
        renderPage={(page) => <LangSmithRunRows runs={page.runs} onOpenRun={props.onOpenRun} />}
      />
    </IssueListShell>
  );
}

function LangSmithRunRows(props: {
  readonly runs: ReadonlyArray<LangSmithRunSummary>;
  readonly onOpenRun: (target: LangSmithRunTarget) => void;
}) {
  return props.runs.map((run) => (
    <IssueRow
      key={run.id}
      onOpen={() => props.onOpenRun({ runId: run.id, name: run.name })}
      leading={
        <Badge size="sm" variant="error">
          {run.runType}
        </Badge>
      }
      title={run.errorFirstLine ? `${run.name} — ${run.errorFirstLine}` : run.name}
      meta={
        <>
          {run.projectName ? <span>{run.projectName}</span> : null}
          <span>{formatRelativeTimeLabel(run.startTime)}</span>
          <span>{formatLatency(run.latencyMs)}</span>
          {run.totalTokens !== null ? <span>{run.totalTokens} tokens</span> : null}
        </>
      }
    />
  ));
}
