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

/** Shares one native type graph across a compilation generation and disposes it on success or failure. */
export async function withOwnedNativeCompilationSession<T>(
	run: (session: ExactCompilerSession) => Promise<T>
): Promise<T> {
	const session = createOwnedNativeCompilationSession(undefined)!;
	try {
		return await run(session);
	} finally {
		session.dispose();
	}
}
