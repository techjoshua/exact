type CoreApi = Pick<
	typeof import('@exactjs/router'),
	'matchRoutes' | 'generatePath' | 'createExactRouter' | 'createMemoryLocationSource'
> &
	Pick<typeof import('@exactjs/router/modern'), 'createStaticHandler'>;
type ClientApi = Pick<
	typeof import('@exactjs/router/modern'),
	| 'createMemoryRouter'
	| 'RouterProvider'
	| 'useLoaderData'
	| 'useActionData'
	| 'useRouteError'
	| 'useMatches'
	| 'useRouteLoaderData'
> &
	Pick<typeof import('@exactjs/react-compat'), 'act' | 'createElement'> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('Routing records: ' + message);
}

/** Preserves own parameter and route-ID entries without accepting inherited values as data. */
export async function verifyRouteRecords(api: CoreApi): Promise<void> {
	for (const key of ['ordinary', '__proto__', 'constructor', 'toString']) {
		const match = api.matchRoutes([{ id: 'route', path: `/:${key}` }], '/value')[0]!;
		check(
			Object.hasOwn(match.params, key) && match.params[key] === 'value',
			'prototype-named parameters retain their own captured value'
		);
		check(
			api.generatePath(`/:${key}`, Object.fromEntries([[key, 'value']])) === '/value',
			'provided own parameter generates its URL'
		);
		let rejected = false;
		try {
			api.generatePath(`/:${key}`, {});
		} catch {
			rejected = true;
		}
		check(
			rejected && api.generatePath(`/:${key}?`, {}) === '/',
			'inherited properties cannot satisfy required or optional parameters'
		);
	}
	for (const failure of ['none', 'error', 'response']) {
		const error =
			failure === 'response'
				? new Response('expected', { status: 401, headers: { 'x-route': 'error' } })
				: new Error('expected');
		const router = api.createExactRouter({
			source: api.createMemoryLocationSource('/home'),
			routes: [
				{
					id: '__proto__',
					path: '/home',
					loader: () => {
						if (failure !== 'none') throw error;
						return new Response('{"value":"ok"}', {
							headers: { 'x-route': 'present', 'Content-Type': 'application/json' }
						});
					}
				}
			]
		});
		try {
			await router.initialize();
			const snapshot = router.getSnapshot();
			if (failure !== 'none') {
				check(
					Object.hasOwn(snapshot.errors, '__proto__') && snapshot.errors.__proto__ === error,
					'errors retain an own route entry'
				);
				if (failure === 'response')
					check(
						snapshot.loaderHeaders.__proto__?.get('x-route') === 'error',
						'thrown response headers retain their own route entry'
					);
			} else
				check(
					Object.hasOwn(snapshot.loaderData, '__proto__') &&
						(snapshot.loaderData.__proto__ as { value: string }).value === 'ok' &&
						snapshot.loaderHeaders.__proto__?.get('x-route') === 'present',
					'data and successful response headers retain own entries'
				);
		} finally {
			router.dispose();
		}
	}
	const handler = api.createStaticHandler([
		{ id: 'constructor', path: '/', loader: () => undefined }
	]);
	check(
		(await handler.queryRoute(new Request('https://example.test/'))) === undefined,
		'an undefined route result cannot become inherited data'
	);
}

/** Distinguishes absent records from explicit undefined failures without replacing valid route presentation. */
export async function verifyRouteRecordReaders(api: ClientApi, document: Document): Promise<void> {
	for (const failure of [false, true]) {
		let observed: unknown[] = [];
		let selected = false;
		function Page() {
			observed = [
				api.useLoaderData(),
				api.useActionData(),
				api.useRouteError(),
				api.useMatches()[0]?.data,
				api.useRouteLoaderData('__proto__')
			];
			return api.createElement('p', null, 'page');
		}
		function ErrorPage() {
			selected = true;
			check(api.useRouteError() === undefined, 'boundary retains exact thrown undefined');
			return api.createElement('p', null, 'error');
		}
		const router = api.createMemoryRouter([
			{
				id: 'constructor',
				path: '/',
				...(failure
					? {
							loader: () => {
								throw undefined;
							}
						}
					: {}),
				Component: Page,
				ErrorBoundary: ErrorPage
			}
		]);
		const container = document.createElement('main');
		let root: ReturnType<ClientApi['createRoot']> | undefined;
		try {
			root = api.createRoot(container);
			await router.initialize();
			await api.act(() => root!.render(api.createElement(api.RouterProvider, { router })));
			check(
				selected === failure && container.textContent === (failure ? 'error' : 'page'),
				'only an owned error entry selects the boundary'
			);
			if (!failure)
				check(
					observed.length === 5 && observed.every((value) => value === undefined),
					'all compatibility readers exclude inherited record values'
				);
		} finally {
			try {
				await api.act(() => root?.unmount());
			} finally {
				router.dispose();
			}
		}
	}
}
