import type { EnvironmentId, ServerSettingsPatch } from "@t3tools/contracts";
import { RegistryContext } from "@effect/atom-react";
import type { AsyncResult, Atom } from "effect/reactivity";
import { useContext, useState } from "react";

import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

/**
 * Saves and removes one tracker's token in environment settings, and checks it with the
 * tracker's scopes query (teams, projects). The caller owns the drafts and builds the patches.
 */
export function useIssueTrackerCredential<A, E>(options: {
  readonly environmentId: EnvironmentId;
  /** The tracker's name, e.g. "Linear". */
  readonly label: string;
  readonly isSaved: boolean;
  readonly scopes: Atom.Atom<AsyncResult.AsyncResult<A, E>>;
  /** The status line once the scopes load, e.g. "Connected as Ada". */
  readonly connectedLabel: (scopes: A) => string;
}) {
  const registry = useContext(RegistryContext);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: `save ${options.label} credentials`,
  });
  const [saving, setSaving] = useState(false);
  // Only read while a token is saved, so opening settings without one sends no request.
  const scopes = useEnvironmentQuery(options.isSaved ? options.scopes : null);

  const update = async (patch: ServerSettingsPatch, recheck: boolean) => {
    setSaving(true);
    try {
      const result = await updateSettings({
        environmentId: options.environmentId,
        input: { patch },
      });
      if (result._tag !== "Success") return false;
      // The client only sees a redaction marker, which reads the same before and after a
      // replacement, so a save drops the old token's cached scopes itself. On a query nothing
      // reads, this only marks it stale; it fetches once the saved token shows it.
      if (recheck) registry.refresh(options.scopes);
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
    save: (patch: ServerSettingsPatch) => update(patch, true),
    remove: (patch: ServerSettingsPatch) => update(patch, false),
    status: !options.isSaved
      ? null
      : scopes.isPending
        ? "Checking..."
        : scopes.data !== null
          ? options.connectedLabel(scopes.data)
          : scopes.error,
  };
}
