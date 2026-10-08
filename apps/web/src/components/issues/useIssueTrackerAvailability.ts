import type { EnvironmentId, ProjectId, ServerSettings } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { Atom } from "effect/reactivity";

import { isElectron } from "~/env";
import { serverEnvironment } from "~/state/server";

const NO_SETTINGS_ATOM = Atom.make<ServerSettings | null>(null);

export interface IssueTrackerAvailability {
  readonly linear: boolean;
  readonly sentry: boolean;
  readonly langsmith: boolean;
}

const NONE: IssueTrackerAvailability = { linear: false, sentry: false, langsmith: false };

/** A tracker is offered for a project once its token is saved and the project has a scope. */
export function useIssueTrackerAvailability(
  environmentId: EnvironmentId | null,
  projectId: ProjectId | null,
): IssueTrackerAvailability {
  const settings = useAtomValue(
    environmentId === null ? NO_SETTINGS_ATOM : serverEnvironment.settingsValueAtom(environmentId),
  );
  if (!isElectron || settings === null || projectId === null) return NONE;
  const project = resolveProjectSettings(settings, projectId).settings;
  return {
    linear: settings.linear.apiKey.length > 0 && project.linearTeamIds.length > 0,
    sentry:
      settings.sentry.authToken.length > 0 &&
      settings.sentry.organization.length > 0 &&
      project.sentryProjects.length > 0,
    langsmith: settings.langsmith.apiKey.length > 0 && project.langsmithProjects.length > 0,
  };
}
