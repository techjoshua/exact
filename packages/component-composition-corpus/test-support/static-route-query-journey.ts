type Api = Pick<typeof import('@exactjs/router/modern'), 'createStaticHandler'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('Single-route query: ' + message);
}

/** Selects one route before dispatch and retains request metadata, raw responses and exact failures. */
export async function verifySingleRouteQueries(api: Api): Promise<void> {
	for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
		for (const [suffix, routeId, selected] of [
			['', undefined, 'parent'],
			['?index', undefined, 'index'],
			['?index=value', undefined, 'parent'],
			['', 'index', 'index'],
			['?index', 'parent', 'parent']
		] as const) {
			const calls: string[] = [];
			const context = { tenant: 'exact' };
			const record = (name: string) => async (args: { request: Request; context: unknown }) => {
				check(
					args.context === context &&
						args.request.method === method &&
						args.request.headers.get('x-input') === 'present',
					'selected handler retains request metadata and context'
				);
				if (method !== 'GET' && method !== 'HEAD')
					check((await args.request.text()) === 'body', 'selected action retains incoming body');
				calls.push(name);
				return name;
			};
			const parent = record('parent');
			const index = record('index');
			const handler = api.createStaticHandler([
				{
					id: 'parent',
					path: '/home',
					loader: parent,
					action: parent,
					children: [{ id: 'index', index: true, loader: index, action: index }]
				}
			]);
			const value = await handler.queryRoute(
				new Request('https://example.test/home' + suffix, {
					method,
					headers: { 'x-input': 'present' },
					...(method === 'GET' || method === 'HEAD' ? {} : { body: 'body' })
				}),
				{ routeId, requestContext: context }
			);
			check(
				value === selected && calls.join(',') === selected,
				'only the selected data handler executes'
			);
		}
	}
	let calls = 0;
	const handler = api.createStaticHandler([
		{ id: 'home', path: '/home', loader: () => ++calls, action: () => ++calls }
	]);
	for (const routeId of ['missing', 'constructor']) {
		const rejected = await handler
			.queryRoute(new Request('https://example.test/home'), { routeId })
			.then(
				() => false,
				(error) => error?.status === 403
			);
		check(rejected && calls === 0, 'invalid explicit selection rejects before dispatch');
	}
	for (const method of ['GET', 'POST'])
		for (const mode of ['returned', 'thrown', 'undefined', 'error']) {
			const value =
				mode === 'undefined'
					? undefined
					: mode === 'error'
						? new Error('expected')
						: new Response('original', { status: 202, headers: { 'x-value': 'kept' } });
			const handler = api.createStaticHandler([
				{ id: 'home', path: '/home', loader: run, action: run }
			]);
			function run() {
				if (mode === 'returned') return value;
				throw value;
			}
			const outcome = await handler
				.queryRoute(new Request('https://example.test/home', { method }))
				.then(
					(value) => ({ rejected: false, value }),
					(value) => ({ rejected: true, value })
				);
			check(
				outcome.rejected === (mode !== 'returned') && outcome.value === value,
				'route query preserves response identity and exact thrown values'
			);
		}
	let factories = 0;
	let ancestors = 0;
	const lazy = api.createStaticHandler([
		{
			id: 'parent',
			path: '/home',
			loader: () => ++ancestors,
			children: [
				{
					id: 'child',
					path: 'child',
					lazy: async () => {
						factories++;
						return { loader: () => 'lazy' };
					}
				}
			]
		}
	]);
	check(
		(await lazy.queryRoute(new Request('https://example.test/home/child'))) === 'lazy' &&
			factories === 1 &&
			ancestors === 0,
		'selected lazy route dispatch avoids ancestor loader effects'
	);
}
