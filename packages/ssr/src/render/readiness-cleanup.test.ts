import { componentReadinessContext } from '@exactjs/core';
import { expect, it, vi } from 'vitest';
import { createSsrContext } from './context.js';
import { renderNativeSuspenseCapability } from './native-boundaries.js';

it('releases a suspense owner and preserves render failure after readiness discard throws', async () => {
	const disposed = vi.fn();
	const primary = new Error('candidate render failed');
	const cleanup = new Error('readiness discard failed');
	await expect(
		renderNativeSuspenseCapability(
			createSsrContext({}),
			{ children: [], props: { fallback: null } },
			undefined,
			{},
			(_context, _children, owner) => {
				owner!.onUnmount(disposed);
				componentReadinessContext(owner)!.register({
					owner: owner!,
					taskGeneration: 1,
					settlement: new Promise(() => {}),
					discard() {
						throw cleanup;
					}
				});
				throw primary;
			}
		)
	).rejects.toBe(primary);
	expect(disposed).toHaveBeenCalledOnce();
	expect(primary).toMatchObject({ suppressed: [cleanup] });
});
