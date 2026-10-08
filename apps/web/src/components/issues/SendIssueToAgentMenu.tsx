import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { sortThreads } from "@t3tools/client-runtime/state/thread-sort";
import { useNavigate } from "@tanstack/react-router";
import { BotIcon, ChevronDownIcon, ListIcon, MessageSquareIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type { ComposerThreadTarget } from "~/composerDraftStore";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { buildThreadRouteParams } from "~/threadRoutes";
import { Button } from "~/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "~/components/ui/menu";
import { toastManager } from "~/components/ui/toast";

import { type IssueAgentTask, writeIssueTaskToComposer } from "./issueContext";

const OTHER_THREAD_LIMIT = 15;

/** New thread, the thread beside the panel, or another thread of the project; never sends. */
export function SendIssueToAgentMenu(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly currentTarget: ComposerThreadTarget | null;
  readonly currentThreadId: ThreadId | null;
  readonly buildTask: () => IssueAgentTask | null;
}) {
  const newThread = useNewThreadHandler();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const projectRef = useMemo(
    () => scopeProjectRef(props.environmentId, props.projectId),
    [props.environmentId, props.projectId],
  );
  const projectRefs = useMemo(() => [projectRef], [projectRef]);
  const threads = useThreadShellsForProjectRefs(projectRefs);
  const otherThreads = useMemo(
    () =>
      sortThreads(
        threads.filter(
          (thread) => thread.archivedAt === null && thread.id !== props.currentThreadId,
        ),
        "updated_at",
      ).slice(0, OTHER_THREAD_LIMIT),
    [props.currentThreadId, threads],
  );

  const sendToNewThread = async () => {
    const task = props.buildTask();
    if (task === null) return;
    setBusy(true);
    const opened = await newThread(projectRef).catch(() => null);
    setBusy(false);
    if (opened === null) {
      toastManager.add({ type: "error", title: "Could not open a thread" });
      return;
    }
    writeIssueTaskToComposer(opened.draftId, task);
  };

  const sendToCurrentThread = () => {
    const task = props.buildTask();
    if (task === null || props.currentTarget === null) return;
    writeIssueTaskToComposer(props.currentTarget, task);
  };

  const sendToThread = async (threadId: ThreadId) => {
    const task = props.buildTask();
    if (task === null) return;
    const ref = scopeThreadRef(props.environmentId, threadId);
    writeIssueTaskToComposer(ref, task);
    await navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button size="xs" disabled={busy}>
            <BotIcon className="size-3.5" />
            Send to agent
            <ChevronDownIcon className="size-3" />
          </Button>
        }
      />
      <MenuPopup align="end" side="bottom" sideOffset={4}>
        <MenuItem onClick={() => void sendToNewThread()}>
          <PlusIcon className="size-3.5" />
          New thread
        </MenuItem>
        <MenuItem disabled={props.currentTarget === null} onClick={sendToCurrentThread}>
          <MessageSquareIcon className="size-3.5" />
          Current thread
        </MenuItem>
        <MenuSub>
          <MenuSubTrigger disabled={otherThreads.length === 0}>
            <ListIcon className="size-3.5" />
            Other thread
          </MenuSubTrigger>
          <MenuSubPopup>
            {otherThreads.map((thread) => (
              <MenuItem key={thread.id} onClick={() => void sendToThread(thread.id)}>
                <span className="max-w-64 truncate">{thread.title}</span>
              </MenuItem>
            ))}
          </MenuSubPopup>
        </MenuSub>
      </MenuPopup>
    </Menu>
  );
}
