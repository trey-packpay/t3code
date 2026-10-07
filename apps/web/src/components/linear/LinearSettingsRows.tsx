import type { EnvironmentId } from "@t3tools/contracts";
import { useAtomRefresh } from "@effect/atom-react";
import { useState } from "react";

import { useEnvironmentSettings } from "~/hooks/useSettings";
import { linearEnvironment } from "~/state/linear";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "~/components/ui/button";

import { MultiSelectMenu, SecretTokenInput } from "../issues/IssueTrackerSettingsControls";
import { searchableSetting } from "../settings/settingsSearch";
import { SettingsRow } from "../settings/settingsLayout";
import { useScopedSettings, useUpdateScopedSettings } from "../settings/useScopedSettings";

export function LinearSettingsRows(props: { readonly environmentId: EnvironmentId }) {
  const saved = useEnvironmentSettings(props.environmentId, (settings) => settings.linear);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "save Linear credentials",
  });
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const isSaved = saved.apiKey.length > 0;
  const teamsAtom = linearEnvironment.teams({ environmentId: props.environmentId, input: {} });
  // Bound to the real atom even while no key is saved: the redacted key looks the same before
  // and after a replacement, so a save has to drop the cached result for the old key itself.
  const refreshTeams = useAtomRefresh(teamsAtom);
  const teams = useEnvironmentQuery(isSaved ? teamsAtom : null);
  const scoped = useScopedSettings();
  const updateScoped = useUpdateScopedSettings();

  const save = async (apiKey: string) => {
    setSaving(true);
    try {
      const result = await updateSettings({
        environmentId: props.environmentId,
        input: { patch: { linear: { apiKey } } },
      });
      if (result._tag === "Success") {
        setDraft("");
        refreshTeams();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsRow
        serverScoped
        {...searchableSetting("linear-credentials")}
        description="A Linear personal API key (Settings > Security & access > API keys in Linear). Stored in this environment's secret store."
        status={
          !isSaved
            ? null
            : teams.isPending
              ? "Checking..."
              : teams.data
                ? `Connected as ${teams.data.viewerName}`
                : teams.error
        }
        control={
          <div className="flex items-center gap-1.5">
            <SecretTokenInput
              id="linear-api-key"
              isSaved={isSaved}
              draft={draft}
              onDraftChange={setDraft}
            />
            <Button
              size="sm"
              disabled={saving || draft.trim().length === 0}
              onClick={() => void save(draft.trim())}
            >
              Save
            </Button>
            {isSaved ? (
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => void save("")}>
                Remove
              </Button>
            ) : null}
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
