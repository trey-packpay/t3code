# Issue trackers

The desktop app can show Linear issues, Sentry issues, and failed LangSmith runs beside a thread,
and hand any of them to an agent. Issue trackers are read-only.

## Connect a service

Open **Settings → Integrations → Issue trackers**.

- **Linear:** paste a personal API key (in Linear: Settings → Security & access → API keys).
- **Sentry:** paste an auth token with `org:read` and `event:read`, and your organization
  slug. Leave the URL empty for sentry.io. Self-hosted or EU-region Sentry needs its URL.
- **LangSmith:** paste an API key. Leave the endpoint empty for the US cloud. EU-region
  workspaces use `https://eu.api.smith.langchain.com`. For a self-hosted instance, enter its
  URL (`https://<host>`) or its `https://<host>/api/v1` API URL.

Tokens stay in the T3 Code server's secret store. They are never sent to any client, including
your other devices.

## Choose what a project shows

In the same section, choose Linear teams, Sentry projects, or LangSmith projects. With
**All projects** selected at the top of Settings, the choice is the environment default. Choose a
project to override it for that project (see [Settings and project overrides](./project-settings.md)).
A tracker is offered in a thread's right panel once it has a token and the thread's project has a
selection.

Sentry shows issues seen in the last 14 days. LangSmith shows failed top-level runs from the last
24 hours, 7 days, or 30 days.

## Send an issue to an agent

Open the tracker from the right panel's **+** menu or the command palette, open an item, then use
**Send to agent**:

- **New thread** opens a new thread for the project.
- **Current thread** adds it to the thread beside the panel.
- **Other thread** adds it to one of the project's recent threads.

The issue is attached as a chip with a short instruction you can edit. Nothing is sent until you
press send. Text from the tracker is marked to the agent as untrusted context, not instructions.
