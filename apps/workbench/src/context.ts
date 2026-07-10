import { createContext } from "@exact/core";
import type { WorkbenchServices } from "./types.js";

export const WorkbenchContext = createContext<WorkbenchServices>("Workbench");
