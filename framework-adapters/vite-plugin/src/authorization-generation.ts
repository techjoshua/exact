import type { ExactComponentAuthorizationSession } from '@exactjs/component-library-policy';

/**
 * Rechecks an in-flight resolver request when its owner replaces the authorization generation.
 * Obsolete reads cannot publish into the replacement graph. Policy failures from the current
 * generation and final owner disposal remain errors.
 */
export async function runExactViteAuthorizationGeneration<T>(
	current: () => ExactComponentAuthorizationSession | undefined,
	run: (session: ExactComponentAuthorizationSession, assertCurrent: () => void) => Promise<T>
): Promise<T> {
	for (;;) {
		const session = current();
		if (!session) throw new Error('Vite authorization owner is disposed');
		const assertCurrent = () => {
			if (!current()) throw new Error('Vite authorization owner is disposed');
			if (current() !== session) throw new Error('Vite authorization generation was replaced');
		};
		try {
			const result = await run(session, assertCurrent);
			assertCurrent();
			return result;
		} catch (error) {
			if (!current() || current() === session) throw error;
		}
	}
}
