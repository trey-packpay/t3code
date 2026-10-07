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

export function createSentryEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Persistence.EnvironmentCacheStore | R, E>,
  options: { readonly settings: IssueTrackerSettingsAtom },
) {
  const scope = createIssueTrackerScopeSignal(
    "environment-data:sentry:scope",
    options.settings,
    (settings, projectId) => [
      settings.sentry.authToken.length > 0,
      // Plain values, unlike the redacted token, so switching organization or host refetches.
      settings.sentry.organization,
      settings.sentry.baseUrl,
      projectId === null
        ? null
        : resolveProjectSettings(settings, projectId).settings.sentryProjects,
    ],
  );
  return {
    scope,
    projects: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:sentry:projects",
      tag: WS_METHODS.sentryListProjects,
      staleTimeMs: 300_000,
      refreshTrigger: ({ environmentId }) => scope(environmentId, null),
    }),
    issues: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:sentry:issues",
      tag: WS_METHODS.sentryListIssues,
      staleTimeMs: 30_000,
      refreshTrigger: ({ environmentId, input }) => scope(environmentId, input.projectId),
    }),
    issue: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:sentry:issue",
      tag: WS_METHODS.sentryIssueDetail,
      staleTimeMs: 60_000,
      refreshTrigger: ({ environmentId }) => scope(environmentId, null),
    }),
  };
}
