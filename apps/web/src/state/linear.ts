import { createLinearEnvironmentAtoms } from "@t3tools/client-runtime/state/linear";

import { connectionAtomRuntime } from "../connection/runtime";
import { serverEnvironment } from "./server";

export const linearEnvironment = createLinearEnvironmentAtoms(connectionAtomRuntime, {
  settings: serverEnvironment.settingsValueAtom,
});
