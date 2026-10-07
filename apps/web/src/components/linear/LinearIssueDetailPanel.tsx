import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { useMemo } from "react";

import type { ComposerThreadTarget } from "~/composerDraftStore";
import { Badge } from "~/components/ui/badge";
import { linearEnvironment } from "~/state/linear";
import { useEnvironmentQuery } from "~/state/query";

import { buildIssueAgentTask, issueDocumentMarkdown } from "../issues/issueContext";
import {
  IssueDetailShell,
  IssueListSkeleton,
  IssueTrackerStateView,
} from "../issues/IssuePanelChrome";
import { SendIssueToAgentMenu } from "../issues/SendIssueToAgentMenu";
import {
  LINEAR_PRIORITY_LABELS,
  linearIssueDocument,
  linearTaskPrompt,
} from "./linearIssueDocument";

export function LinearIssueDetailPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly identifier: string;
  readonly threadRef: ScopedThreadRef | null;
  readonly composerDraftTarget: ComposerThreadTarget | null;
}) {
  const detail = useEnvironmentQuery(
    linearEnvironment.issue({
      environmentId: props.environmentId,
      input: { identifier: props.identifier },
    }),
  );
  const issue = detail.data;
  const document = useMemo(() => (issue ? linearIssueDocument(issue) : null), [issue]);

  if (issue === null || document === null) {
    return detail.error !== null ? (
      <IssueTrackerStateView
        source="linear"
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
      source="linear"
      identifier={issue.identifier}
      title={issue.title}
      url={issue.url}
      environmentId={props.environmentId}
      threadRef={props.threadRef}
      refreshing={detail.isPending}
      onRefresh={detail.refresh}
      // A failed refresh keeps the last good issue below a one-line error.
      error={detail.error}
      onRetry={detail.refresh}
      markdown={issueDocumentMarkdown(document)}
      badges={
        <>
          <Badge size="sm" variant="outline">
            {issue.state.name}
          </Badge>
          {issue.priority > 0 ? (
            <Badge size="sm" variant="secondary">
              {LINEAR_PRIORITY_LABELS[issue.priority]}
            </Badge>
          ) : null}
        </>
      }
      actions={
        <SendIssueToAgentMenu
          environmentId={props.environmentId}
          projectId={props.projectId}
          currentTarget={props.composerDraftTarget}
          currentThreadId={props.threadRef?.threadId ?? null}
          buildTask={() => buildIssueAgentTask(document, linearTaskPrompt(issue))}
        />
      }
    />
  );
}
