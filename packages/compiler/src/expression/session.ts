import type { BoundModule } from '@exact/expressions';
import { ExactCompilerSession } from './project.js';
import type { ExactCompilerSessionOptions, ExpressionModuleOptions } from './session-contracts.js';

const defaultSession = new ExactCompilerSession();

/** Creates an isolated incremental compiler session for one owner lifecycle. */
export function createCompilerSession(
	options: ExactCompilerSessionOptions = {}
): ExactCompilerSession {
	return new ExactCompilerSession(options);
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
}

/** Invalidates one source module in the process-wide convenience session. */
export function invalidateExpressionModule(filename: string, removed = false): void {
	defaultSession.invalidate(filename, removed);
}
