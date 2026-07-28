import type { ExactCompilerSession } from '../expression/project.js';
import { createCompilerSession } from '../expression/session.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

/**
 * Creates the native session owned by one high-level compilation operation.
 *
 * Caller-supplied sessions retain their existing ownership.
 */
export function createOwnedNativeCompilationSession(
	session: ExactCompilerSession | undefined
): ExactCompilerSession | undefined {
	if (session) return undefined;
	return createCompilerSession({
		nativeCompiler: { executable: resolveNativeCompilerExecutable() }
	});
}
