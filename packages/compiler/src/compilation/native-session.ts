import type { ExactCompilerSession } from '../expression/project.js';
import { createCompilerSession } from '../expression/session.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

/** Selects the compiler implementation for high-level compilation APIs. */
export type ExactCompilerSelection = 'native' | 'legacy';

/**
 * Creates the native session owned by one high-level compilation operation.
 *
 * Caller-supplied sessions retain their existing ownership. Legacy mode is an
 * explicit compatibility boundary and therefore creates no native resources.
 */
export function createOwnedNativeCompilationSession(
	session: ExactCompilerSession | undefined,
	compiler: ExactCompilerSelection | undefined
): ExactCompilerSession | undefined {
	if (session || compiler === 'legacy') return undefined;
	return createCompilerSession({
		nativeCompiler: { executable: resolveNativeCompilerExecutable() }
	});
}
