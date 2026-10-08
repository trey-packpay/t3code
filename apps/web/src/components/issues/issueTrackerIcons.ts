import type { IssueTrackerSource } from "@t3tools/contracts";
import { BugIcon, ListTodoIcon, WorkflowIcon, type LucideIcon } from "lucide-react";

/** Brand-neutral glyphs; the repo carries no Linear, Sentry or LangSmith marks. */
export const ISSUE_TRACKER_ICONS: Record<IssueTrackerSource, LucideIcon> = {
  linear: ListTodoIcon,
  sentry: BugIcon,
  langsmith: WorkflowIcon,
};
