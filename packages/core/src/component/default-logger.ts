import { createConsoleLogger } from '../logging.js';

/** Provides the canonical default console logger without linking component logging machinery. */
export const defaultConsoleLogger = createConsoleLogger();
