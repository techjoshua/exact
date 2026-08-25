import { ErrorContext, LoggerContext } from './contexts.js';

import { defaultErrorContext } from './errors.js';

import { defaultConsoleLogger } from './log.js';

/** Provides the canonical default contexts value. */
export const defaultContexts = new Map<symbol, unknown>([
	[LoggerContext.id, defaultConsoleLogger],
	[ErrorContext.id, defaultErrorContext]
]);
