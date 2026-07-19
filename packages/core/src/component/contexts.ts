import { createContext } from '../keys.js';

import type { Logger } from '../logging.js';

import type { ErrorContextValue, SuspensionContextValue } from './contracts.js';

export const LoggerContext = createContext<Logger>('exact.logger', true);
export const ErrorContext = createContext<ErrorContextValue>('exact.error', true);
export const SuspensionContext = createContext<SuspensionContextValue>('exact.suspension');
