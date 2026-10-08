import { createSentryEnvironmentAtoms } from "@t3tools/client-runtime/state/sentry";

import { connectionAtomRuntime } from "../connection/runtime";
import { serverEnvironment } from "./server";

export const sentryEnvironment = createSentryEnvironmentAtoms(connectionAtomRuntime, {
  settings: serverEnvironment.settingsValueAtom,
});
