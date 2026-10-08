import type {
  EnvironmentId,
  IssueTrackerSource,
  ProjectId,
  ServerSettings,
} from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

/** An environment's settings as the client sees them; null until they load. */
export type IssueTrackerSettingsAtom = (
  environmentId: EnvironmentId,
) => Atom.Atom<ServerSettings | null>;

const credentialRevisions = Atom.family((key: string) =>
  Atom.make(0).pipe(Atom.keepAlive, Atom.withLabel(`issue-tracker-credential-revision:${key}`)),
);

/**
 * Counts this client's successful saves and removes of one tracker's credential. Settings only
 * carry a redaction marker for the token, which reads the same before and after a replacement,
 * so the settings form bumps this and every query in the tracker's scope signal refetches.
 */
export function issueTrackerCredentialRevision(
  environmentId: EnvironmentId,
  source: IssueTrackerSource,
): Atom.Writable<number> {
  return credentialRevisions(JSON.stringify([environmentId, source]));
}

/**
 * A refresh signal for one tracker's queries, derived from settings and the credential revision.
 * `select` returns what the queries depend on: whether a token is saved and, for a project, its
 * mapping. A list or detail that is on screen refetches when that changes instead of showing the
 * old scope until it goes stale. `projectId` is null for queries that are not project-scoped.
 */
export function createIssueTrackerScopeSignal(
  source: IssueTrackerSource,
  settings: IssueTrackerSettingsAtom,
  select: (settings: ServerSettings, projectId: ProjectId | null) => unknown,
) {
  const family = Atom.family((key: string) => {
    const [environmentId, projectId] = JSON.parse(key) as [EnvironmentId, ProjectId | null];
    return Atom.make((get) => {
      const current = get(settings(environmentId));
      if (current === null) return null;
      const revision = get(issueTrackerCredentialRevision(environmentId, source));
      // Serialized, so an unrelated settings change compares equal and refetches nothing.
      return JSON.stringify([revision, select(current, projectId)]);
    }).pipe(Atom.withLabel(`environment-data:${source}:scope:${key}`));
  });
  return (environmentId: EnvironmentId, projectId: ProjectId | null) =>
    family(JSON.stringify([environmentId, projectId]));
}
