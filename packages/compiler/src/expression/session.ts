import type { BoundModule } from '@exactjs/expressions';
import { clearNativePrintingSession } from '../emission/native-printing.js';
import { clearNativeTypeParsingSession } from '../emission/native-type-parsing.js';
import { ExactCompilerSession } from './project.js';
import type { ExactCompilerSessionOptions, ExpressionModuleOptions } from './session-contracts.js';

// Expression-only convenience APIs retain their compatibility projection.
// Compilation entry points create an explicitly owned native session.
const defaultSession = new ExactCompilerSession({ compiler: 'legacy' });
let defaultNativeSession: ExactCompilerSession | undefined;

/** Creates an isolated incremental compiler session for one owner lifecycle. */
export function createCompilerSession(
	options: ExactCompilerSessionOptions = {}
): ExactCompilerSession {
	return new ExactCompilerSession(options);
}

/** Returns the lazy process-wide native session used by synchronous convenience APIs. */
export function defaultNativeCompilerSession(): ExactCompilerSession {
	return (defaultNativeSession ??= new ExactCompilerSession());
}

/** Projects a source module through the process-wide convenience session. */
export function expressionModuleFor(
	filename: string,
	source: string,
	options: ExpressionModuleOptions = {}
): BoundModule {
	return defaultSession.expressionModuleFor(filename, source, options);
}

/** Resolves source dependencies through the process-wide convenience session. */
export function expressionDependencyFiles(filename: string, source: string): readonly string[] {
	return defaultSession.expressionDependencyFiles(filename, source);
}

/** Clears every project and cache owned by the process-wide convenience session. */
export function clearExpressionProjectCache(): void {
	defaultSession.clear();
	defaultNativeSession?.dispose();
	defaultNativeSession = undefined;
	clearNativePrintingSession();
	clearNativeTypeParsingSession();
}

/** Invalidates one source module in the process-wide convenience session. */
export function invalidateExpressionModule(filename: string, removed = false): void {
	defaultSession.invalidate(filename, removed);
}
