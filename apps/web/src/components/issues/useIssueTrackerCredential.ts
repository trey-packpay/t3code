import type { EnvironmentId, IssueTrackerSource, ServerSettingsPatch } from "@t3tools/contracts";
import { RegistryContext } from "@effect/atom-react";
import { issueTrackerCredentialRevision } from "@t3tools/client-runtime/state/issue-tracker-scope";
import type { AsyncResult, Atom } from "effect/reactivity";
import { useContext, useState } from "react";

import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

import { ISSUE_SOURCE_LABELS } from "./issueContext";

/**
 * Saves and removes one tracker's token in environment settings, and checks it with the
 * tracker's scopes query (teams, projects). The caller owns the drafts and builds the patches.
 */
export function useIssueTrackerCredential<A, E>(options: {
  readonly environmentId: EnvironmentId;
  readonly source: IssueTrackerSource;
  readonly isSaved: boolean;
  readonly scopes: Atom.Atom<AsyncResult.AsyncResult<A, E>>;
  /** The status line once the scopes load, e.g. "Connected as Ada". */
  readonly connectedLabel: (scopes: A) => string;
}) {
  const registry = useContext(RegistryContext);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: `save ${ISSUE_SOURCE_LABELS[options.source]} credentials`,
  });
  const [saving, setSaving] = useState(false);
  // Only read while a token is saved, so opening settings without one sends no request.
  const scopes = useEnvironmentQuery(options.isSaved ? options.scopes : null);

  const update = async (patch: ServerSettingsPatch) => {
    setSaving(true);
    try {
      const result = await updateSettings({
        environmentId: options.environmentId,
        input: { patch },
      });
      if (result._tag !== "Success") return false;
      // The tracker's scope signal reads this revision, so its scopes, lists and details refetch
      // even when only the token changed (settings show the same redaction marker for it).
      registry.update(
        issueTrackerCredentialRevision(options.environmentId, options.source),
        (revision) => revision + 1,
      );
      return true;
    } finally {
      setSaving(false);
    }
  };

  return {
    /** The scopes query; null data while no token is saved. */
    scopes,
    saving,
    /** Resolves true once saved, so the caller can clear its drafts. */
    save: update,
    remove: update,
    status: !options.isSaved
      ? null
      : scopes.isPending
        ? "Checking..."
        : scopes.data !== null
          ? options.connectedLabel(scopes.data)
          : scopes.error,
  };
}
