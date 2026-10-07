import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { useMemo } from "react";

import type { ComposerThreadTarget } from "~/composerDraftStore";
import { Badge } from "~/components/ui/badge";
import { sentryEnvironment } from "~/state/sentry";
import { useEnvironmentQuery } from "~/state/query";

import { buildIssueAgentTask, issueDocumentMarkdown } from "../issues/issueContext";
import {
  IssueDetailShell,
  IssueListSkeleton,
  IssueTrackerStateView,
} from "../issues/IssuePanelChrome";
import { SendIssueToAgentMenu } from "../issues/SendIssueToAgentMenu";
import {
  SENTRY_LEVEL_VARIANTS,
  sentryIssueDocument,
  sentryTaskPrompt,
} from "./sentryIssueDocument";

export function SentryIssueDetailPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly issueId: string;
  readonly threadRef: ScopedThreadRef | null;
  readonly composerDraftTarget: ComposerThreadTarget | null;
}) {
  const detail = useEnvironmentQuery(
    sentryEnvironment.issue({
      environmentId: props.environmentId,
      input: { issueId: props.issueId },
    }),
  );
  const issue = detail.data;
  const document = useMemo(() => (issue ? sentryIssueDocument(issue) : null), [issue]);

  if (issue === null || document === null) {
    return detail.error !== null ? (
      <IssueTrackerStateView
        source="sentry"
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
      source="sentry"
      identifier={issue.shortId}
      title={issue.title}
      url={issue.permalink}
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
          <Badge size="sm" variant={SENTRY_LEVEL_VARIANTS[issue.level] ?? "secondary"}>
            {issue.level}
          </Badge>
          <Badge size="sm" variant="outline">
            {issue.status}
          </Badge>
        </>
      }
      actions={
        <SendIssueToAgentMenu
          environmentId={props.environmentId}
          projectId={props.projectId}
          currentTarget={props.composerDraftTarget}
          currentThreadId={props.threadRef?.threadId ?? null}
          buildTask={() => buildIssueAgentTask(document, sentryTaskPrompt(issue))}
        />
      }
    />
  );
}
