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

export function createLangSmithEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Persistence.EnvironmentCacheStore | R, E>,
  options: { readonly settings: IssueTrackerSettingsAtom },
) {
  const scope = createIssueTrackerScopeSignal(
    "langsmith",
    options.settings,
    (settings, projectId) => [
      settings.langsmith.apiKey.length > 0,
      // A plain value, unlike the redacted key, so switching region or host refetches.
      settings.langsmith.endpoint,
      projectId === null
        ? null
        : resolveProjectSettings(settings, projectId).settings.langsmithProjects,
    ],
  );
  return {
    scope,
    projects: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:langsmith:projects",
      tag: WS_METHODS.langsmithListProjects,
      staleTimeMs: 300_000,
      refreshTrigger: ({ environmentId }) => scope(environmentId, null),
    }),
    runs: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:langsmith:runs",
      tag: WS_METHODS.langsmithListErroredRuns,
      staleTimeMs: 30_000,
      refreshTrigger: ({ environmentId, input }) => scope(environmentId, input.projectId),
    }),
    run: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:langsmith:run",
      tag: WS_METHODS.langsmithRunDetail,
      staleTimeMs: 60_000,
      refreshTrigger: ({ environmentId }) => scope(environmentId, null),
    }),
  };
}
