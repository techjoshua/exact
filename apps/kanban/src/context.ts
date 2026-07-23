import { createContext } from '@exactjs/core';
import type { BoardServices } from './types.js';

/** Provides the canonical board context value. */
export const BoardContext = createContext<BoardServices>('Board');
