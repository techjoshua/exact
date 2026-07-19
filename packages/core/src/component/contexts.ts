import { createContext } from '../keys.js';

import type { Logger } from '../logging.js';

import type { ErrorContextValue, SuspensionContextValue } from './contracts.js';

/** Provides the canonical logger context value. */
export const LoggerContext = createContext<Logger>('exact.logger', true);
/** Provides the canonical error context value. */
export const ErrorContext = createContext<ErrorContextValue>('exact.error', true);
/** Provides the canonical suspension context value. */
export const SuspensionContext = createContext<SuspensionContextValue>('exact.suspension');
