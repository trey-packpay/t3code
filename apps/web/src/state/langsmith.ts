import { createLangSmithEnvironmentAtoms } from "@t3tools/client-runtime/state/langsmith";

import { connectionAtomRuntime } from "../connection/runtime";
import { serverEnvironment } from "./server";

export const langsmithEnvironment = createLangSmithEnvironmentAtoms(connectionAtomRuntime, {
  settings: serverEnvironment.settingsValueAtom,
});
