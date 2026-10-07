import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { useMemo } from "react";

import type { ComposerThreadTarget } from "~/composerDraftStore";
import { Badge } from "~/components/ui/badge";
import { langsmithEnvironment } from "~/state/langsmith";
import { useEnvironmentQuery } from "~/state/query";

import { buildIssueAgentTask, issueDocumentMarkdown } from "../issues/issueContext";
import {
  IssueDetailShell,
  IssueListSkeleton,
  IssueTrackerStateView,
} from "../issues/IssuePanelChrome";
import { SendIssueToAgentMenu } from "../issues/SendIssueToAgentMenu";
import { formatLatency, langsmithRunDocument, langsmithTaskPrompt } from "./langsmithRunDocument";

export function LangSmithRunDetailPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly runId: string;
  readonly threadRef: ScopedThreadRef | null;
  readonly composerDraftTarget: ComposerThreadTarget | null;
}) {
  const detail = useEnvironmentQuery(
    langsmithEnvironment.run({ environmentId: props.environmentId, input: { runId: props.runId } }),
  );
  const run = detail.data;
  // Inputs and outputs can be large, so the document builds once per result.
  const document = useMemo(() => (run ? langsmithRunDocument(run) : null), [run]);

  if (run === null || document === null) {
    return detail.error !== null ? (
      <IssueTrackerStateView
        source="langsmith"
        failure={detail.failure}
        error={detail.error}
        onRetry={detail.refresh}
      />
    ) : (
      <IssueListSkeleton />
    );
  }

  return (
    <IssueDetailShell
      source="langsmith"
      identifier={run.id.slice(0, 8)}
      title={run.name}
      url={run.url}
      environmentId={props.environmentId}
      threadRef={props.threadRef}
      refreshing={detail.isPending}
      onRefresh={detail.refresh}
      // A failed refresh keeps the last good run below a one-line error.
      error={detail.error}
      onRetry={detail.refresh}
      markdown={issueDocumentMarkdown(document)}
      badges={
        <>
          <Badge size="sm" variant="error">
            {run.runType}
          </Badge>
          <Badge size="sm" variant="outline">
            {formatLatency(run.latencyMs)}
          </Badge>
        </>
      }
      actions={
        <SendIssueToAgentMenu
          environmentId={props.environmentId}
          projectId={props.projectId}
          currentTarget={props.composerDraftTarget}
          currentThreadId={props.threadRef?.threadId ?? null}
          buildTask={() => buildIssueAgentTask(document, langsmithTaskPrompt(run))}
        />
      }
    />
  );
}
