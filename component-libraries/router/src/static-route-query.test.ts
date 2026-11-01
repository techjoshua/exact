import { expect, it } from 'vitest';
import { createStaticHandler } from './modern.js';

it.each([
	['/home', undefined, 'parent'],
	['/home?index', undefined, 'index'],
	['/home?index=value', undefined, 'parent'],
	['/home?index', 'parent', 'parent'],
	['/home', 'index', 'index']
] as const)('selects only %s route data before dispatch', async (path, routeId, selected) => {
	const calls: string[] = [];
	const handler = createStaticHandler([
		{
			id: 'parent',
			path: '/home',
			loader: () => {
				calls.push('parent');
				return 'parent';
			},
			children: [
				{
					id: 'index',
					index: true,
					loader: () => {
						calls.push('index');
						return 'index';
					}
				}
			]
		}
	]);
	const result = await handler.queryRoute(new Request('https://example.test' + path), { routeId });
	expect(result).toBe(selected);
	expect(calls).toEqual([selected]);
});

it('rejects an unmatched explicit route before loader side effects', async () => {
	let calls = 0;
	const handler = createStaticHandler([{ id: 'home', path: '/home', loader: () => ++calls }]);
	await expect(
		handler.queryRoute(new Request('https://example.test/home'), { routeId: 'missing' })
	).rejects.toBeDefined();
	expect(calls).toBe(0);
});

it.each(['returned-response', 'thrown-response', 'thrown-error', 'thrown-undefined'] as const)(
	'preserves %s route results',
	async (mode) => {
		const value =
			mode === 'thrown-undefined'
				? undefined
				: mode === 'thrown-error'
					? new Error('expected')
					: new Response('original', { status: 202, headers: { 'x-value': 'kept' } });
		const handler = createStaticHandler([
			{
				id: 'home',
				path: '/home',
				loader: () => {
					if (mode === 'returned-response') return value;
					throw value;
				}
			}
		]);
		const work = handler.queryRoute(new Request('https://example.test/home'));
		if (mode === 'returned-response') await expect(work).resolves.toBe(value);
		else await expect(work).rejects.toBe(value);
	}
);

it('supports OPTIONS loader queries and rejects unknown methods before dispatch', async () => {
	let calls = 0;
	const handler = createStaticHandler([
		{ id: 'home', path: '/home', loader: () => ++calls, action: () => ++calls }
	]);
	await expect(
		handler.queryRoute(new Request('https://example.test/home', { method: 'OPTIONS' }))
	).resolves.toBe(1);
	await expect(
		handler.queryRoute(new Request('https://example.test/home', { method: 'CUSTOM' }))
	).rejects.toMatchObject({ status: 405 });
	expect(calls).toBe(1);
});

import { verifySingleRouteQueries } from '../../../packages/component-composition-corpus/test-support/static-route-query-journey.js';
it('executes the portable single-route query contract', () =>
	verifySingleRouteQueries({ createStaticHandler }));
