import { expect, it } from 'vitest';
import { createMemoryRouter } from './modern.js';
import * as api from './core.js';
import { verifyDataActionTargets } from '../../../packages/component-composition-corpus/test-support/router-fetcher-target-journey.js';

it('preserves native data action target ownership and rejects missing handlers before publication', () =>
	verifyDataActionTargets(api));

it('matches pinned parent and index action selection by destination URL', async () => {
	const packageName = 'react-router-dom-v7';
	const actual = await import(packageName);
	const actualCalls: string[] = [];
	const exactCalls: string[] = [];
	const routes = (calls: string[]) => [
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
	];
	const actualRouter = actual.createMemoryRouter(routes(actualCalls), {
		initialEntries: ['/data']
	});
	const exactRouter = createMemoryRouter(routes(exactCalls), { initialEntries: ['/data'] });
	try {
		for (const [url, expected] of [
			['/data', 'parent'],
			['/data?index=one', 'parent'],
			['/data?index', 'index']
		] as const) {
			await actualRouter.navigate(url, { formMethod: 'POST', formData: new FormData() });
			await exactRouter.submit(url, { method: 'POST', body: new FormData() });
			expect(actualCalls.at(-1)).toBe(expected);
			expect(exactCalls.at(-1)).toBe(expected);
		}
		const accepted = exactRouter.getSnapshot().actionData;
		await expect(exactRouter.submit('/data/empty', { method: 'POST' })).rejects.toThrow(
			'No route action'
		);
		expect(exactRouter.getSnapshot().actionData).toBe(accepted);
	} finally {
		actualRouter.dispose();
		exactRouter.dispose();
	}
});
