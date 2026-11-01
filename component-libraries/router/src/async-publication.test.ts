import { expect, it, vi, onTestFinished } from 'vitest';
import { createExactRouter } from './core.js';
import { createMemoryLocationSource } from './core/location-sources.js';

it.each(['replace', 'release', 'dispose'])(
	'fences a held fetcher response body after %s',
	async (mode) => {
		let body!: ReadableStreamDefaultController<Uint8Array>;
		const response = new Response(
			new ReadableStream<Uint8Array>({
				start(controller) {
					body = controller;
				}
			}),
			{
				headers: { 'Content-Type': 'application/json' }
			}
		);
		let reading = false;
		const json = response.json.bind(response);
		vi.spyOn(response, 'json').mockImplementation(() => {
			reading = true;
			return json();
		});
		const router = createExactRouter({
			source: createMemoryLocationSource('/'),
			routes: [
				{
					id: 'item',
					path: '/:id',
					loader: ({ params }) => (params.id === 'old' ? response : 'new')
				}
			]
		});
		onTestFinished(() => router.dispose());
		const pending = router.fetch('same', 'item', '/old');
		await expect.poll(() => reading).toBe(true);
		if (mode === 'replace') await router.fetch('same', 'item', '/new');
		else if (mode === 'release') router.releaseFetcher('same');
		else router.dispose();
		const snapshot = router.getSnapshot();
		body.enqueue(new TextEncoder().encode('"old"'));
		body.close();
		await pending;
		expect(router.getSnapshot()).toBe(snapshot);
		if (mode !== 'dispose') router.sync();
		if (mode === 'replace')
			expect(router.getSnapshot().fetchers.get('same')).toEqual({ state: 'idle', data: 'new' });
		else if (mode === 'release') expect(router.getSnapshot().fetchers.has('same')).toBe(false);
	}
);

it('does not move history when a delayed publication loses navigation ownership', async () => {
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let entered = false;
	const source = createMemoryLocationSource('/');
	const router = createExactRouter({
		source,
		routes: [{ id: 'page', path: '/:id?' }],
		publication: {
			async publish(context) {
				if (context.metadata.to.pathname === '/old') {
					entered = true;
					await held;
				}
				context.publish();
			}
		}
	});
	onTestFinished(() => router.dispose());
	const old = router.navigate('/old');
	await expect.poll(() => entered).toBe(true);
	await router.navigate('/new');
	release();
	await old;
	expect(source.location().pathname).toBe('/new');
	expect(router.getSnapshot().location.pathname).toBe('/new');
});
