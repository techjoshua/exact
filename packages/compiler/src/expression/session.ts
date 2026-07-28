import { ExactCompilerSession } from './project.js';
import type { ExactCompilerSessionOptions } from './session-contracts.js';

let defaultNativeSession: ExactCompilerSession | undefined;

/** Creates an isolated native compiler session for one owner lifecycle. */
export function createCompilerSession(
	options: ExactCompilerSessionOptions = {}
): ExactCompilerSession {
	return new ExactCompilerSession(options);
}

/** Returns the lazy process-wide native session used by synchronous convenience APIs. */
export function defaultNativeCompilerSession(): ExactCompilerSession {
	return (defaultNativeSession ??= new ExactCompilerSession());
}

/** Clears the process-wide native compiler session. */
export function clearExpressionProjectCache(): void {
	defaultNativeSession?.dispose();
	defaultNativeSession = undefined;
}

/** Invalidates one source module in the process-wide native session. */
export function invalidateExpressionModule(filename: string, _removed = false): void {
	defaultNativeSession?.invalidate(filename);
}
