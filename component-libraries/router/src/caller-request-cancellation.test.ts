import { expect, it } from 'vitest';
import { createExactRouter, createMemoryLocationSource } from './core.js';

for (const mode of ['submit', 'fetch'] as const) {
	it(`${mode} rejects an already canceled caller without dispatch or publication`, async () => {
		let calls = 0;
		const router = createExactRouter({
			source: createMemoryLocationSource('/home'),
			routes: [{ id: 'home', path: '/home', action: () => ++calls }]
		});
		const before = router.getSnapshot();
		const caller = new AbortController();
		caller.abort(null);
		try {
			const init = { method: 'POST', signal: caller.signal };
			const work =
				mode === 'submit'
					? router.submit('/home', init)
					: router.fetch('owned', 'home', '/home', init);
			await expect(work).rejects.toBe(null);
			expect(calls).toBe(0);
			expect(router.getSnapshot()).toBe(before);
		} finally {
			router.dispose();
		}
	});

	it(`${mode} settles caller cancellation before an uncooperative handler and fences its late result`, async () => {
		let finish!: (value: string) => void;
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		let signal!: AbortSignal;
		const router = createExactRouter({
			source: createMemoryLocationSource('/home'),
			routes: [
				{
					id: 'home',
					path: '/home',
					action: (args) => {
						signal = args.signal;
						entered();
						return new Promise<string>((resolve) => {
							finish = resolve;
						});
					}
				}
			]
		});
		const caller = new AbortController();
		try {
			const init = { method: 'POST', signal: caller.signal };
			const work =
				mode === 'submit'
					? router.submit('/home', init)
					: router.fetch('owned', 'home', '/home', init);
			const rejection = expect(work).rejects.toBe(null);
			await started;
			caller.abort(null);
			await rejection;
			expect(signal.aborted).toBe(true);
			expect(signal.reason).toBe(null);
			expect(router.getSnapshot().navigation.state).toBe('idle');
			expect(router.getSnapshot().fetchers.has('owned')).toBe(false);
			finish('stale');
			await Promise.resolve();
			await Promise.resolve();
			expect(router.getSnapshot().actionData).toEqual({});
			await router.navigate('/next');
			expect(router.getSnapshot().location.pathname).toBe('/next');
		} finally {
			finish?.('cleanup');
			router.dispose();
		}
	});
}

import { verifyCallerRequestCancellation } from '../../../packages/component-composition-corpus/test-support/router-request-cancellation-journey.js';
it('preserves newer work started by caller abort callbacks', () =>
	verifyCallerRequestCancellation({ createExactRouter, createMemoryLocationSource }));

it('settles canceled action revalidation without leaving loading state', async () => {
	let finish!: () => void;
	let entered!: () => void;
	const ready = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const router = createExactRouter({
		source: createMemoryLocationSource('/home'),
		hydrationData: { loaderData: { home: 'initial' } },
		routes: [
			{
				id: 'home',
				path: '/home',
				action: () => 'saved',
				loader: () => {
					entered();
					return new Promise<string>((resolve) => {
						finish = () => resolve('late');
					});
				}
			}
		]
	});
	const caller = new AbortController();
	try {
		const work = router.submit('/home', { method: 'POST', signal: caller.signal });
		const rejected = expect(work).rejects.toBe(null);
		await ready;
		caller.abort(null);
		await rejected;
		expect(router.getSnapshot().revalidation).toBe('idle');
		expect(router.getSnapshot().loaderData.home).toBe('initial');
	} finally {
		finish?.();
		router.dispose();
	}
});

it.each(['submit', 'fetch'] as const)(
	'%s releases caller cancellation after settlement',
	async (mode) => {
		let signal!: AbortSignal;
		const router = createExactRouter({
			source: createMemoryLocationSource('/home'),
			routes: [
				{
					id: 'home',
					path: '/home',
					action: (args) => {
						signal = args.signal;
						return 'saved';
					}
				}
			]
		});
		const caller = new AbortController();
		try {
			const init = { method: 'POST', signal: caller.signal };
			await (mode === 'submit'
				? router.submit('/home', init)
				: router.fetch('owned', 'home', '/home', init));
			const before = router.getSnapshot();
			caller.abort(null);
			expect(signal.aborted).toBe(false);
			expect(router.getSnapshot()).toBe(before);
		} finally {
			router.dispose();
		}
	}
);

it.each(['submit-redirect', 'fetch-revalidation'] as const)(
	'%s retains caller cancellation through delegated work',
	async (mode) => {
		let finish!: (value: string) => void;
		let entered!: () => void;
		const ready = new Promise<void>((resolve) => {
			entered = resolve;
		});
		let signal!: AbortSignal;
		const loader = (args: { signal: AbortSignal }) => {
			signal = args.signal;
			entered();
			return new Promise<string>((resolve) => {
				finish = resolve;
			});
		};
		const router = createExactRouter({
			source: createMemoryLocationSource('/home'),
			hydrationData: { loaderData: { home: 'initial' } },
			routes: [
				{
					id: 'home',
					path: '/home',
					action: () =>
						mode === 'submit-redirect'
							? new Response(null, { status: 302, headers: { Location: '/next' } })
							: 'saved',
					loader
				},
				{ id: 'next', path: '/next', loader }
			]
		});
		const caller = new AbortController();
		try {
			const init = { method: 'POST', signal: caller.signal };
			const work =
				mode === 'submit-redirect'
					? router.submit('/home', init)
					: router.fetch('owned', 'home', '/home', init);
			const rejected = expect(work).rejects.toBe(null);
			await ready;
			caller.abort(null);
			await rejected;
			expect(signal.aborted).toBe(true);
			expect(router.getSnapshot().navigation.state).toBe('idle');
			expect(router.getSnapshot().revalidation).toBe('idle');
			finish('late');
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(router.getSnapshot().location.pathname).toBe('/home');
			expect(router.getSnapshot().loaderData).toEqual({ home: 'initial' });
		} finally {
			finish?.('cleanup');
			router.dispose();
		}
	}
);

import { verifyDelegatedRequestCancellation } from '../../../packages/component-composition-corpus/test-support/router-request-cancellation-journey.js';
it('carries caller cancellation through every delegated routing path', () =>
	verifyDelegatedRequestCancellation({ createExactRouter, createMemoryLocationSource }));
