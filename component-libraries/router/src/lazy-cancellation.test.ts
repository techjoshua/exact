import { expect, it, vi, onTestFinished } from 'vitest';
import { createExactRouter } from './core.js';
import { createMemoryLocationSource } from './core/location-sources.js';
import type { ExactRouteDefinition } from './core/contracts.js';

it.each(
	['navigate', 'submit', 'fetch-loader', 'fetch-action'].flatMap((operation) =>
		['dispose', 'supersede'].map((cancellation) => ({ operation, cancellation }))
	)
)(
	'does not start a lazy route handler after $cancellation during $operation',
	async ({ operation, cancellation }) => {
		let release!: (route: Partial<ExactRouteDefinition>) => void;
		const lazy = vi.fn(
			() =>
				new Promise<Partial<ExactRouteDefinition>>((resolve) => {
					release = resolve;
				})
		);
		const handler = vi.fn(() => 'unexpected');
		const router = createExactRouter({
			source: createMemoryLocationSource('/'),
			routes: [
				{ id: 'home', path: '/' },
				{ id: 'lazy', path: '/lazy', lazy },
				{ id: 'safe', path: '/safe', loader: () => 'safe', action: () => 'safe' }
			]
		});
		onTestFinished(() => router.dispose());
		const pending =
			operation === 'navigate'
				? router.navigate('/lazy')
				: operation === 'submit'
					? router.submit('/lazy', { method: 'POST' })
					: router.fetch(
							'held',
							'lazy',
							'/lazy',
							operation === 'fetch-action' ? { method: 'POST' } : {}
						);
		await expect.poll(() => lazy.mock.calls.length).toBe(1);
		if (cancellation === 'dispose') router.dispose();
		else if (operation.startsWith('fetch'))
			await router.fetch(
				'held',
				'safe',
				'/safe',
				operation === 'fetch-action' ? { method: 'POST' } : {}
			);
		else await router.navigate('/safe');
		release({ loader: handler, action: handler });
		await pending;
		expect(handler).not.toHaveBeenCalled();
	}
);

it('retries lazy materialization after a failed navigation', async () => {
	const lazy = vi
		.fn()
		.mockRejectedValueOnce(new Error('temporary module failure'))
		.mockResolvedValue({ loader: () => 'recovered' });
	const router = createExactRouter({
		source: createMemoryLocationSource('/'),
		routes: [
			{ id: 'home', path: '/' },
			{ id: 'lazy', path: '/lazy', lazy }
		]
	});
	onTestFinished(() => router.dispose());
	await router.navigate('/lazy');
	expect(router.getSnapshot().errors.lazy).toBeInstanceOf(Error);
	await router.navigate('/lazy');
	expect(lazy).toHaveBeenCalledTimes(2);
	expect(router.getSnapshot().loaderData.lazy).toBe('recovered');
	expect(router.getSnapshot().errors).toEqual({});
});

it('shares pending lazy work across fetchers and retains successful materialization', async () => {
	let release!: (route: Partial<ExactRouteDefinition>) => void;
	const lazy = vi.fn(
		() =>
			new Promise<Partial<ExactRouteDefinition>>((resolve) => {
				release = resolve;
			})
	);
	const handler = vi.fn(() => 'ready');
	const router = createExactRouter({
		source: createMemoryLocationSource('/'),
		routes: [{ id: 'lazy', path: '/lazy', lazy }]
	});
	onTestFinished(() => router.dispose());
	const first = router.fetch('first', 'lazy', '/lazy');
	const second = router.fetch('second', 'lazy', '/lazy');
	await expect.poll(() => lazy.mock.calls.length).toBe(1);
	release({ loader: handler });
	await Promise.all([first, second]);
	await router.fetch('third', 'lazy', '/lazy');
	expect(lazy).toHaveBeenCalledTimes(1);
	expect(handler).toHaveBeenCalledTimes(3);
	for (const key of ['first', 'second', 'third'])
		expect(router.getSnapshot().fetchers.get(key)).toEqual({ state: 'idle', data: 'ready' });
});
