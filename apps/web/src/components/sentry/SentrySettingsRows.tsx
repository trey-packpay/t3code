import type { EnvironmentId, SentryProjectRef } from "@t3tools/contracts";
import { useState } from "react";

import { Input } from "~/components/ui/input";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { sentryEnvironment } from "~/state/sentry";

import {
  CredentialButtons,
  MultiSelectMenu,
  SecretTokenInput,
} from "../issues/IssueTrackerSettingsControls";
import { useIssueTrackerCredential } from "../issues/useIssueTrackerCredential";
import { searchableSetting } from "../settings/settingsSearch";
import { SettingsRow } from "../settings/settingsLayout";
import { useScopedSettings, useUpdateScopedSettings } from "../settings/useScopedSettings";

export function SentrySettingsRows(props: { readonly environmentId: EnvironmentId }) {
  const saved = useEnvironmentSettings(props.environmentId, (settings) => settings.sentry);
  const tokenSaved = saved.authToken.length > 0;
  // Sentry needs both the token and the organization before anything can be listed.
  const isSaved = tokenSaved && saved.organization.length > 0;
  const credential = useIssueTrackerCredential({
    environmentId: props.environmentId,
    source: "sentry",
    isSaved,
    scopes: sentryEnvironment.projects({ environmentId: props.environmentId, input: {} }),
    connectedLabel: (result) => `Connected to ${result.organization}`,
  });
  const projects = credential.scopes;
  const [token, setToken] = useState("");
  // null while the field shows the saved value.
  const [organization, setOrganization] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const scoped = useScopedSettings();
  const updateScoped = useUpdateScopedSettings();
  const organizationValue = (organization ?? saved.organization).trim();
  const baseUrlValue = (baseUrl ?? saved.baseUrl).trim();
  const tokenDraft = token.trim();
  const changed =
    tokenDraft.length > 0 ||
    organizationValue !== saved.organization ||
    baseUrlValue !== saved.baseUrl;
  const canSave = changed && organizationValue.length > 0 && (tokenDraft.length > 0 || tokenSaved);
  const clearDrafts = (ok: boolean) => {
    if (!ok) return;
    setToken("");
    setOrganization(null);
    setBaseUrl(null);
  };

  return (
    <>
      <SettingsRow
        serverScoped
        {...searchableSetting("sentry-credentials")}
        description="A Sentry auth token with org:read and event:read, plus your organization slug. Leave the URL empty for sentry.io."
        status={credential.status}
        control={
          <div className="flex flex-col items-end gap-1.5">
            <SecretTokenInput
              id="sentry-auth-token"
              isSaved={tokenSaved}
              draft={token}
              onDraftChange={setToken}
            />
            <Input
              size="sm"
              aria-label="Sentry organization slug"
              placeholder="organization-slug"
              value={organization ?? saved.organization}
              onChange={(event) => setOrganization(event.target.value)}
            />
            <Input
              size="sm"
              aria-label="Sentry URL"
              placeholder="https://sentry.io"
              value={baseUrl ?? saved.baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
            <div className="flex gap-1.5">
              <CredentialButtons
                saving={credential.saving}
                canSave={canSave}
                isSaved={tokenSaved}
                onSave={() =>
                  void credential
                    .save({
                      sentry: {
                        // An omitted token keeps the stored one.
                        ...(tokenDraft.length > 0 ? { authToken: tokenDraft } : {}),
                        organization: organizationValue,
                        baseUrl: baseUrlValue,
                      },
                    })
                    .then(clearDrafts)
                }
                onRemove={() =>
                  void credential
                    .remove({ sentry: { authToken: "", organization: "", baseUrl: "" } })
                    .then(clearDrafts)
                }
              />
            </div>
          </div>
        }
      />
      {isSaved ? (
        <SettingsRow
          serverScoped
          settingKeys={["sentryProjects"]}
          {...searchableSetting("sentry-projects")}
          description="Sentry projects whose issues show in this project's Sentry panel."
          control={
            <MultiSelectMenu
              ariaLabel="Sentry projects"
              placeholder={projects.isPending ? "Loading..." : "None"}
              disabled={projects.data === null}
              options={(projects.data?.projects ?? []).map((project) => ({
                value: project.id,
                label: project.slug,
              }))}
              selected={scoped.sentryProjects.map((project) => project.id)}
              onChange={(ids) => {
                // Mapped projects missing from the loaded list keep their stored slug.
                const known = new Map<string, SentryProjectRef>(
                  scoped.sentryProjects.map((project) => [project.id, project]),
                );
                for (const project of projects.data?.projects ?? []) {
                  known.set(project.id, { id: project.id, slug: project.slug });
                }
                updateScoped({
                  sentryProjects: ids.flatMap((id) => {
                    const project = known.get(id);
                    return project ? [project] : [];
                  }),
                });
              }}
            />
          }
        />
      ) : null}
    </>
  );
}
