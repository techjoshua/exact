type CoreApi = Pick<
	typeof import('@exactjs/router'),
	'createExactRouter' | 'createMemoryLocationSource'
>;
type ClientApi = Pick<
	typeof import('@exactjs/router/modern'),
	'createMemoryRouter' | 'RouterProvider' | 'useFetcher'
> &
	Pick<typeof import('@exactjs/react-compat'), 'act' | 'createElement'> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('Fetcher targets: ' + message);
}

/** Selects data routes by URL while retaining explicit route IDs and rejecting unmatched targets. */
export async function verifyFetcherDataTargets(api: CoreApi): Promise<void> {
	const router = api.createExactRouter({
		source: api.createMemoryLocationSource('/data'),
		routes: [
			{
				id: 'parent',
				path: '/data',
				loader: () => 'parent',
				children: [
					{
						id: 'layout',
						children: [
							{ id: 'index', index: true, loader: () => 'index', action: () => 'index-action' }
						]
					},
					{ id: 'empty', path: 'empty' }
				]
			}
		]
	});
	try {
		for (const [target, expected] of [
			['/data', 'parent'],
			['/data?index=one', 'parent'],
			['/data?index', 'index'],
			['/data?index=one&index=', 'index']
		]) {
			await router.fetch('automatic', undefined, target!);
			check(
				router.getSnapshot().fetchers.get('automatic')?.data === expected,
				'URL selects a path-contributing route or explicitly requested index'
			);
		}
		await router.fetch('automatic', undefined, '/data?index', { method: 'POST' });
		check(
			router.getSnapshot().fetchers.get('automatic')?.data === 'index-action',
			'index query also selects mutation actions'
		);
		await router.fetch('explicit', 'index', '/data');
		check(
			router.getSnapshot().fetchers.get('explicit')?.data === 'index',
			'explicit native index selection remains supported'
		);
		await router.fetch('empty', undefined, '/data/empty');
		check(
			router.getSnapshot().fetchers.get('empty')?.error instanceof Error,
			'missing target loader cannot silently fall back to an ancestor loader'
		);
		for (const [key, routeId, target] of [
			['invalid', 'missing', '/data'],
			['unmatched', undefined, '/missing']
		] as const) {
			let rejected = false;
			try {
				await router.fetch(key, routeId, target);
			} catch {
				rejected = true;
			}
			check(
				rejected && !router.getSnapshot().fetchers.has(key),
				'invalid target is rejected before fetcher state is allocated'
			);
		}
	} finally {
		router.dispose();
	}
}

/** Uses the same URL selection for submission actions and rejects missing leaf handlers before mutation. */
export async function verifyDataActionTargets(api: CoreApi): Promise<void> {
	const calls: string[] = [];
	const router = api.createExactRouter({
		source: api.createMemoryLocationSource('/data'),
		routes: [
			{
				id: 'parent',
				path: '/data',
				action: () => {
					calls.push('parent');
					return 'parent';
				},
				children: [
					{
						id: 'index',
						index: true,
						action: () => {
							calls.push('index');
							return 'index';
						}
					},
					{ id: 'empty', path: 'empty' }
				]
			}
		]
	});
	try {
		for (const [url, expected] of [
			['/data', 'parent'],
			['/data?index=one', 'parent'],
			['/data?index', 'index']
		] as const) {
			await router.submit(url, { method: 'POST' });
			check(calls.at(-1) === expected, 'parent and index actions follow target URL');
		}
		const before = router.getSnapshot();
		let rejected = false;
		try {
			await router.submit('/data/empty', { method: 'POST' });
		} catch {
			rejected = true;
		}
		check(
			rejected && router.getSnapshot() === before,
			'missing leaf action cannot invoke an ancestor or mutate navigation state'
		);
	} finally {
		router.dispose();
	}
}

/** Loads and submits to other routes without transferring component ownership or page navigation. */
export async function verifyFetcherTargets(api: ClientApi, document: Document): Promise<void> {
	let fetcher: ReturnType<ClientApi['useFetcher']> | undefined;
	const calls: string[] = [];
	function Page() {
		fetcher = api.useFetcher<string>();
		return api.createElement('output', null, `${fetcher.state}:${fetcher.data ?? ''}`);
	}
	const router = api.createMemoryRouter(
		[
			{
				id: 'home',
				path: '/home',
				Component: Page,
				loader: () => {
					calls.push('home');
					return 'home';
				}
			},
			{
				id: 'target',
				path: '/target',
				loader: () => {
					calls.push('target');
					return 'target';
				},
				action: async ({ request }) => {
					calls.push('action');
					return (await request.formData()).get('value');
				}
			},
			{
				id: 'child',
				path: '/home/child',
				lazy: async () => ({
					loader: () => {
						calls.push('child');
						return 'child';
					}
				})
			}
		],
		{ initialEntries: ['/home'] }
	);
	const container = document.createElement('main');
	let root: ReturnType<ClientApi['createRoot']> | undefined;
	try {
		root = api.createRoot(container);
		await router.initialize();
		await api.act(() => root!.render(api.createElement(api.RouterProvider, { router })));
		const output = container.querySelector('output');
		await api.act(() => fetcher!.load('/target'));
		check(
			container.textContent === 'idle:target',
			'destination loader runs instead of owning route loader'
		);
		await api.act(() => fetcher!.load('child'));
		check(container.textContent === 'idle:child', 'relative target resolves from owning route');
		await api.act(() => fetcher!.submit({ value: 'saved' }, { action: '/target', method: 'POST' }));
		check(container.textContent === 'idle:saved', 'destination action receives the submission');
		check(
			router.getSnapshot().location.pathname === '/home',
			'fetching does not navigate the owning page'
		);
		check(
			container.querySelector('output') === output,
			'fetcher publication retains its component and DOM identity'
		);
		check(
			calls.join(',') === 'home,target,child,action,home',
			'only targeted handlers and mutation-owned revalidation execute'
		);
	} finally {
		try {
			await api.act(() => root?.unmount());
		} finally {
			router.dispose();
		}
	}
}
