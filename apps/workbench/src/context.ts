import { createContext } from '@exact/core';
import type { WorkbenchServices } from './types.js';

/** Provides the canonical workbench context value. */
export const WorkbenchContext = createContext<WorkbenchServices>('Workbench');
