import { createContext } from "@exact/core";
import type { BoardServices } from "./types.js";

export const BoardContext = createContext<BoardServices>("Board");
