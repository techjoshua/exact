import { describe, expect, it } from 'vitest';
import { generatePath as exactGeneratePath } from './core.js';
import { createMemoryRouter as createExactMemoryRouter } from './modern.js';
import { matchPath as v5MatchPath } from './v5.js';

describe('pinned React Router differential conformance', () => {
	it('matches v5 path parameters and exactness', async () => {
		const packageName = 'react-router-dom-v5';
		const actual: any = await import(packageName);
		const scenarios = [
			['/users/42', { path: '/users/:id', exact: true }],
			['/users/42/edit', { path: '/users/:id', exact: false }],
			['/other', { path: '/users/:id', exact: false }]
		] as const;
		for (const [pathname, pattern] of scenarios) {
			expect(normalizeV5(v5MatchPath(pathname, pattern))).toEqual(
				normalizeV5(actual.matchPath(pathname, pattern))
			);
		}
		expect(exactGeneratePath('/users/:id', { id: '42' })).toBe(
			actual.generatePath('/users/:id', { id: '42' })
		);
	});

	it.each([['v7', 'react-router-dom-v7']])(
		'matches %s memory data-router navigation and loader observations',
		async (_label, packageName) => {
			const actual: any = await import(packageName);
			const actualCalls: string[] = [];
			const exactCalls: string[] = [];
			const actualRouter = actual.createMemoryRouter(
				[
					{
						id: 'user',
						path: '/users/:id',
						loader: ({ params }: any) => {
							actualCalls.push(params.id);
							return { id: params.id };
						}
					}
				],
				{ initialEntries: ['/users/1'] }
			);
			await initialized(actualRouter);
			const exactRouter = createExactMemoryRouter(
				[
					{
						id: 'user',
						path: '/users/:id',
						loader: ({ params }) => {
							exactCalls.push(params.id!);
							return { id: params.id };
						}
					}
				],
				{ initialEntries: ['/users/1'] }
			);
			await exactRouter.initialize();
			await Promise.all([actualRouter.navigate('/users/2'), exactRouter.navigate('/users/2')]);
			expect({
				location: exactRouter.getSnapshot().location.pathname,
				loaderData: exactRouter.getSnapshot().loaderData,
				calls: exactCalls
			}).toEqual({
				location: actualRouter.state.location.pathname,
				loaderData: actualRouter.state.loaderData,
				calls: actualCalls
			});
			actualRouter.dispose();
			exactRouter.dispose();
		}
	);

	it.each([['v7', 'react-router-dom-v7']])(
		'matches %s mutation action data and loader revalidation',
		async (_label, packageName) => {
			const actual: any = await import(packageName);
			let actualCount = 0;
			let exactCount = 0;
			const actualRouter = actual.createMemoryRouter(
				[
					{
						id: 'counter',
						path: '/',
						loader: () => ({ count: actualCount }),
						action: async ({ request }: any) => {
							actualCount = Number((await request.formData()).get('count'));
							return { accepted: actualCount };
						}
					}
				],
				{ initialEntries: ['/'] }
			);
			await initialized(actualRouter);
			const exactRouter = createExactMemoryRouter(
				[
					{
						id: 'counter',
						path: '/',
						loader: () => ({ count: exactCount }),
						action: async ({ request }) => {
							exactCount = Number((await request.formData()).get('count'));
							return { accepted: exactCount };
						}
					}
				],
				{ initialEntries: ['/'] }
			);
			await exactRouter.initialize();
			const actualData = new FormData();
			const exactData = new FormData();
			actualData.set('count', '3');
			exactData.set('count', '3');
			await Promise.all([
				actualRouter.navigate('/', { formMethod: 'post', formData: actualData }),
				exactRouter.submit('/', { method: 'POST', body: exactData })
			]);
			expect({
				actionData: exactRouter.getSnapshot().actionData,
				loaderData: exactRouter.getSnapshot().loaderData
			}).toEqual({
				actionData: actualRouter.state.actionData,
				loaderData: actualRouter.state.loaderData
			});
			actualRouter.dispose();
			exactRouter.dispose();
		}
	);

	it.each([['v7', 'react-router-dom-v7']])(
		'matches %s lazy loader materialization',
		async (_label, packageName) => {
			const actual: any = await import(packageName);
			const actualRouter = actual.createMemoryRouter(
				[
					{
						id: 'lazy',
						path: '/lazy',
						lazy: async () => ({ loader: () => 'ready' })
					}
				],
				{ initialEntries: ['/lazy'] }
			);
			await initialized(actualRouter);
			const exactRouter = createExactMemoryRouter(
				[
					{
						id: 'lazy',
						path: '/lazy',
						lazy: async () => ({ loader: () => 'ready' })
					}
				],
				{ initialEntries: ['/lazy'] }
			);
			await exactRouter.initialize();
			expect(exactRouter.getSnapshot().loaderData).toEqual(actualRouter.state.loaderData);
			actualRouter.dispose();
			exactRouter.dispose();
		}
	);

	it.each([['v7', 'react-router-dom-v7']])(
		'matches %s public path utility observations',
		async (_label, packageName) => {
			const actual: any = await import(packageName);
			const exact: any = await import('./modern.js');
			const paths = [
				{ pathname: '/users/42', search: '?tab=profile', hash: '#bio' },
				{ pathname: '/', search: '', hash: '' }
			];
			for (const value of paths) {
				expect(exact.createPath(value)).toBe(actual.createPath(value));
				expect(exact.parsePath(exact.createPath(value))).toEqual(
					actual.parsePath(actual.createPath(value))
				);
			}
			expect(exact.resolvePath('../settings', '/users/42')).toEqual(
				actual.resolvePath('../settings', '/users/42')
			);
			expect(exact.createSearchParams({ tag: ['one', 'two'] }).toString()).toBe(
				actual.createSearchParams({ tag: ['one', 'two'] }).toString()
			);
		}
	);
});

function normalizeV5(value: any): unknown {
	if (!value) return null;
	return {
		path: value.path,
		url: value.url,
		isExact: value.isExact,
		params: value.params
	};
}

async function initialized(router: any): Promise<void> {
	if (router.state.initialized) return;
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			unsubscribe();
			reject(new Error('Pinned React Router did not initialize'));
		}, 2_000);
		const unsubscribe = router.subscribe((state: any) => {
			if (!state.initialized) return;
			clearTimeout(timeout);
			unsubscribe();
			resolve();
		});
	});
}
