import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { useEnvironmentSettings } from "~/hooks/useSettings";
import { linearEnvironment } from "~/state/linear";

import {
  CredentialButtons,
  MultiSelectMenu,
  SecretTokenInput,
} from "../issues/IssueTrackerSettingsControls";
import { useIssueTrackerCredential } from "../issues/useIssueTrackerCredential";
import { searchableSetting } from "../settings/settingsSearch";
import { SettingsRow } from "../settings/settingsLayout";
import { useScopedSettings, useUpdateScopedSettings } from "../settings/useScopedSettings";

export function LinearSettingsRows(props: { readonly environmentId: EnvironmentId }) {
  const saved = useEnvironmentSettings(props.environmentId, (settings) => settings.linear);
  const isSaved = saved.apiKey.length > 0;
  const credential = useIssueTrackerCredential({
    environmentId: props.environmentId,
    source: "linear",
    isSaved,
    scopes: linearEnvironment.teams({ environmentId: props.environmentId, input: {} }),
    connectedLabel: (teams) => `Connected as ${teams.viewerName}`,
  });
  const teams = credential.scopes;
  const [draft, setDraft] = useState("");
  const scoped = useScopedSettings();
  const updateScoped = useUpdateScopedSettings();

  return (
    <>
      <SettingsRow
        serverScoped
        {...searchableSetting("linear-credentials")}
        description="A Linear personal API key (Settings > Security & access > API keys in Linear). Stored in this environment's secret store."
        status={credential.status}
        control={
          <div className="flex items-center gap-1.5">
            <SecretTokenInput
              id="linear-api-key"
              isSaved={isSaved}
              draft={draft}
              onDraftChange={setDraft}
            />
            <CredentialButtons
              saving={credential.saving}
              canSave={draft.trim().length > 0}
              isSaved={isSaved}
              onSave={() =>
                void credential.save({ linear: { apiKey: draft.trim() } }).then((ok) => {
                  if (ok) setDraft("");
                })
              }
              onRemove={() =>
                void credential.remove({ linear: { apiKey: "" } }).then((ok) => {
                  if (ok) setDraft("");
                })
              }
            />
          </div>
        }
      />
      {isSaved ? (
        <SettingsRow
          serverScoped
          settingKeys={["linearTeamIds"]}
          {...searchableSetting("linear-teams")}
          description="Teams whose issues show in this project's Linear panel."
          control={
            <MultiSelectMenu
              ariaLabel="Linear teams"
              placeholder={teams.isPending ? "Loading..." : "None"}
              disabled={teams.data === null}
              options={(teams.data?.teams ?? []).map((team) => ({
                value: team.id,
                label: `${team.key} · ${team.name}`,
              }))}
              selected={scoped.linearTeamIds}
              onChange={(linearTeamIds) => updateScoped({ linearTeamIds: [...linearTeamIds] })}
            />
          }
        />
      ) : null}
    </>
  );
}
