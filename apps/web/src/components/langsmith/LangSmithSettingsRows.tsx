import type { EnvironmentId, LangSmithProjectRef } from "@t3tools/contracts";
import { useState } from "react";

import { Input } from "~/components/ui/input";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { langsmithEnvironment } from "~/state/langsmith";

import {
  CredentialButtons,
  MultiSelectMenu,
  SecretTokenInput,
} from "../issues/IssueTrackerSettingsControls";
import { useIssueTrackerCredential } from "../issues/useIssueTrackerCredential";
import { searchableSetting } from "../settings/settingsSearch";
import { SettingsRow } from "../settings/settingsLayout";
import { useScopedSettings, useUpdateScopedSettings } from "../settings/useScopedSettings";

export function LangSmithSettingsRows(props: { readonly environmentId: EnvironmentId }) {
  const saved = useEnvironmentSettings(props.environmentId, (settings) => settings.langsmith);
  const isSaved = saved.apiKey.length > 0;
  const credential = useIssueTrackerCredential({
    environmentId: props.environmentId,
    source: "langsmith",
    isSaved,
    scopes: langsmithEnvironment.projects({ environmentId: props.environmentId, input: {} }),
    connectedLabel: (result) =>
      `Connected · ${result.projects.length} ${result.projects.length === 1 ? "project" : "projects"}`,
  });
  const projects = credential.scopes;
  const [apiKey, setApiKey] = useState("");
  // null while the field shows the saved value.
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const scoped = useScopedSettings();
  const updateScoped = useUpdateScopedSettings();
  const apiKeyDraft = apiKey.trim();
  const endpointValue = (endpoint ?? saved.endpoint).trim();
  const changed = apiKeyDraft.length > 0 || endpointValue !== saved.endpoint;
  const canSave = changed && (apiKeyDraft.length > 0 || isSaved);
  const clearDrafts = (ok: boolean) => {
    if (!ok) return;
    setApiKey("");
    setEndpoint(null);
  };

  return (
    <>
      <SettingsRow
        serverScoped
        {...searchableSetting("langsmith-credentials")}
        description="A LangSmith API key. Leave the endpoint empty for api.smith.langchain.com; use https://eu.api.smith.langchain.com for the EU region."
        status={credential.status}
        control={
          <div className="flex flex-col items-end gap-1.5">
            <SecretTokenInput
              id="langsmith-api-key"
              isSaved={isSaved}
              draft={apiKey}
              onDraftChange={setApiKey}
            />
            <Input
              size="sm"
              aria-label="LangSmith endpoint"
              placeholder="https://api.smith.langchain.com"
              value={endpoint ?? saved.endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
            />
            <div className="flex gap-1.5">
              <CredentialButtons
                saving={credential.saving}
                canSave={canSave}
                isSaved={isSaved}
                onSave={() =>
                  void credential
                    .save({
                      langsmith: {
                        // An omitted key keeps the stored one.
                        ...(apiKeyDraft.length > 0 ? { apiKey: apiKeyDraft } : {}),
                        endpoint: endpointValue,
                      },
                    })
                    .then(clearDrafts)
                }
                onRemove={() =>
                  void credential
                    .remove({ langsmith: { apiKey: "", endpoint: "" } })
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
          settingKeys={["langsmithProjects"]}
          {...searchableSetting("langsmith-projects")}
          description="LangSmith projects whose failed runs show in this project's LangSmith panel."
          control={
            <MultiSelectMenu
              ariaLabel="LangSmith projects"
              placeholder={projects.isPending ? "Loading..." : "None"}
              disabled={projects.data === null}
              options={(projects.data?.projects ?? []).map((project) => ({
                value: project.id,
                label: project.name,
              }))}
              selected={scoped.langsmithProjects.map((project) => project.id)}
              onChange={(ids) => {
                // Mapped projects missing from the loaded list keep their stored name.
                const known = new Map<string, LangSmithProjectRef>(
                  scoped.langsmithProjects.map((project) => [project.id, project]),
                );
                for (const project of projects.data?.projects ?? []) {
                  known.set(project.id, { id: project.id, name: project.name });
                }
                updateScoped({
                  langsmithProjects: ids.flatMap((id) => {
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
