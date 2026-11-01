type StaticQueryApi = Pick<typeof import('@exactjs/router/modern'), 'createStaticHandler'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('Static router queries: ' + message);
}

/** Checks disposal after rejected redirect work and successful data or redirect publication. */
export async function verifyStaticRouterQueries(api: StaticQueryApi): Promise<void> {
	for (const mode of ['query', 'queryRoute'] as const) {
		{
			const signals: AbortSignal[] = [];
			const loop = ({ signal }: { signal: AbortSignal }) => {
				signals.push(signal);
				return new Response(null, { status: 302, headers: { Location: '/loop' } });
			};
			const handler = api.createStaticHandler([{ id: 'loop', path: '/loop', loader: loop }]);
			if (mode === 'query') {
				let rejected = false;
				try {
					await handler.query(new Request('https://example.test/loop'));
				} catch (error) {
					rejected = error instanceof Error && /maximum redirect depth/.test(error.message);
				}
				check(rejected, 'whole-page query preserves redirect-depth rejection');
				check(
					signals.length > 1 && signals.every((signal) => signal.aborted),
					'query releases every loader signal after rejection'
				);
			} else {
				const response = await handler.queryRoute(new Request('https://example.test/loop'));
				check(
					response instanceof Response &&
						response.status === 302 &&
						response.headers.get('Location') === '/loop',
					'route query returns its redirect without invoking destination loaders'
				);
				check(
					signals.length === 1 && signals[0]!.aborted,
					'route query releases its handler signal'
				);
			}
		}
		const signals: AbortSignal[] = [];
		const context = { tenant: 'exact' };
		const handler = api.createStaticHandler([
			{
				id: 'report',
				path: '/report',
				loader: ({ signal, context }) => {
					signals.push(signal);
					return new Response((context as { tenant: string }).tenant, {
						status: 202,
						headers: { 'X-Route': 'report' }
					});
				},
				action: async ({ signal, request }) => {
					signals.push(signal);
					return new Response('saved:' + (await request.text()), {
						headers: { 'X-Action': 'report' }
					});
				}
			}
		]);
		for (const method of ['GET', 'HEAD', 'POST']) {
			const value = await handler[mode](
				new Request('https://example.test/report', {
					method,
					...(method === 'POST' ? { body: 'body' } : {})
				}),
				{ requestContext: context }
			);
			if (mode === 'query') {
				check(
					typeof value === 'object' && value !== null && 'loaderData' in value,
					'query returns its static context'
				);
				const result = value as {
					loaderData: Record<string, unknown>;
					actionData: Record<string, unknown>;
					loaderHeaders: Record<string, Headers>;
					actionHeaders: Record<string, Headers>;
				};
				check(
					result.loaderData.report === 'exact' &&
						result.loaderHeaders.report?.get('X-Route') === 'report',
					'loader context, data, and headers survive cleanup'
				);
				if (method === 'POST')
					check(
						result.actionData.report === 'saved:body' &&
							result.actionHeaders.report?.get('X-Action') === 'report',
						'action body, data, and headers survive cleanup'
					);
			} else
				check(
					value instanceof Response &&
						(await value.text()) === (method === 'POST' ? 'saved:body' : 'exact'),
					'queryRoute selects requested route data'
				);
			check(
				signals.every((signal) => signal.aborted),
				'successful query releases its request owner'
			);
		}
		const redirects = api.createStaticHandler([
			{
				id: 'old',
				path: '/old',
				loader: () => new Response(null, { status: 307, headers: { Location: '/report' } })
			},
			{
				id: 'report',
				path: '/report',
				loader: ({ signal }) => {
					signals.push(signal);
					return 'ready';
				}
			}
		]);
		const response = await redirects[mode](new Request('https://example.test/old'));
		check(
			response instanceof Response &&
				response.status === 307 &&
				response.headers.get('Location') ===
					(mode === 'query' ? 'https://example.test/report' : '/report'),
			'redirect status and location survive cleanup'
		);
		check(
			signals.every((signal) => signal.aborted),
			'redirect query releases the final owner'
		);
		if (mode === 'queryRoute') {
			const layered = api.createStaticHandler([
				{
					id: 'parent',
					path: '/parent',
					loader: () => 'parent',
					children: [{ id: 'child', path: 'child', loader: () => 'child' }]
				}
			]);
			check(
				(await layered.queryRoute(new Request('https://example.test/parent/child'))) === 'child',
				'default route selection returns the deepest match'
			);
			check(
				(await layered.queryRoute(new Request('https://example.test/parent/child'), {
					routeId: 'parent'
				})) === 'parent',
				'explicit selection can return ancestor loader data'
			);
		}
	}
}
