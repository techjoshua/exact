// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { mountClientServerTest } from './index.js';

const failures = vi.hoisted(() => ({
	primary: undefined as unknown,
	cleanup: undefined as unknown,
	disposed: 0
}));
vi.mock('@exactjs/hydrate', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@exactjs/hydrate')>();
	return {
		...actual,
		createExactClient(...args: Parameters<typeof actual.createExactClient>) {
			const client = actual.createExactClient(...args);
			return {
				...client,
				whenSettled: () => Promise.reject(failures.primary),
				dispose() {
					client.dispose();
					failures.disposed++;
					throw failures.cleanup;
				}
			};
		}
	};
});

it.each([false, true])(
	'preserves failed mount diagnostics and container ownership (borrowed=%s)',
	async (borrowed) => {
		for (const primary of [
			new Error('settlement failed'),
			Object.freeze(new Error('frozen settlement')),
			undefined
		]) {
			const before = [...document.body.children];
			const container = borrowed ? document.createElement('section') : undefined;
			if (container) document.body.append(container);
			failures.primary = primary;
			failures.cleanup = new Error('client disposal failed');
			failures.disposed = 0;
			try {
				const outcome = await mountClientServerTest({
					server: { html: '<p>Ready</p>' },
					islands: {},
					container,
					handle: () => {
						throw new Error('unexpected dispatch');
					}
				}).then(
					() => ({ rejected: false, error: undefined }),
					(error: unknown) => ({ rejected: true, error })
				);
				expect(failures.disposed).toBe(1);
				expect(outcome.rejected).toBe(true);
				expect(outcome.error).toBe(primary);
				if (primary instanceof Error && !Object.isFrozen(primary))
					expect((primary as Error & { cleanupError: unknown }).cleanupError).toBe(
						failures.cleanup
					);
				expect([...document.body.children]).toEqual(container ? [...before, container] : before);
			} finally {
				container?.remove();
			}
		}
	}
);
