import type { EnvironmentId, ProjectId, ServerSettings } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

/** An environment's settings as the client sees them; null until they load. */
export type IssueTrackerSettingsAtom = (
  environmentId: EnvironmentId,
) => Atom.Atom<ServerSettings | null>;

/**
 * A refresh signal for one tracker's queries, derived from settings. `select` returns what the
 * queries depend on: whether a token is saved and, for a project, its mapping. A list or detail
 * that is on screen refetches when that changes instead of showing the old scope until it goes
 * stale. `projectId` is null for queries that are not project-scoped.
 */
export function createIssueTrackerScopeSignal(
  label: string,
  settings: IssueTrackerSettingsAtom,
  select: (settings: ServerSettings, projectId: ProjectId | null) => unknown,
) {
  const family = Atom.family((key: string) => {
    const [environmentId, projectId] = JSON.parse(key) as [EnvironmentId, ProjectId | null];
    return Atom.make((get) => {
      const current = get(settings(environmentId));
      // Serialized, so an unrelated settings change compares equal and refetches nothing.
      return current === null ? null : JSON.stringify(select(current, projectId));
    }).pipe(Atom.withLabel(`${label}:${key}`));
  });
  return (environmentId: EnvironmentId, projectId: ProjectId | null) =>
    family(JSON.stringify([environmentId, projectId]));
}
