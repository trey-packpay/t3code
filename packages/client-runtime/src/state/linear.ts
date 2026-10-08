import { WS_METHODS } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { Atom } from "effect/reactivity";

import {
  createIssueTrackerScopeSignal,
  type IssueTrackerSettingsAtom,
} from "./issueTrackerScope.ts";
import { createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import * as Persistence from "../platform/persistence.ts";

export function createLinearEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Persistence.EnvironmentCacheStore | R, E>,
  options: { readonly settings: IssueTrackerSettingsAtom },
) {
  const scope = createIssueTrackerScopeSignal("linear", options.settings, (settings, projectId) => [
    settings.linear.apiKey.length > 0,
    projectId === null ? null : resolveProjectSettings(settings, projectId).settings.linearTeamIds,
  ]);
  return {
    scope,
    teams: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:linear:teams",
      tag: WS_METHODS.linearListTeams,
      staleTimeMs: 300_000,
      refreshTrigger: ({ environmentId }) => scope(environmentId, null),
    }),
    issues: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:linear:issues",
      tag: WS_METHODS.linearListIssues,
      staleTimeMs: 30_000,
      refreshTrigger: ({ environmentId, input }) => scope(environmentId, input.projectId),
    }),
    issue: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:linear:issue",
      tag: WS_METHODS.linearIssueDetail,
      staleTimeMs: 60_000,
      refreshTrigger: ({ environmentId }) => scope(environmentId, null),
    }),
  };
}
