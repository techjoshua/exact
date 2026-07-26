import { createContext } from '@exactjs/core';
import type { SudokuCommands } from './types.js';

/** Provides game commands without threading callbacks through the board. */
export const SudokuContext = createContext<SudokuCommands>('SudokuAtelier');
