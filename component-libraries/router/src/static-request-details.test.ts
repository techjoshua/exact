import { expect, it } from 'vitest';
import { createStaticHandler } from './modern.js';

it.each(['GET', 'HEAD'])(
	'preserves incoming %s request headers and method for static loaders',
	async (method) => {
		const handler = createStaticHandler([
			{
				id: 'home',
				path: '/home',
				loader: ({ request }) => ({
					method: request.method,
					header: request.headers.get('x-input')
				})
			}
		]);
		const result = await handler.query(
			new Request('https://example.test/home', { method, headers: { 'x-input': 'present' } })
		);
		expect(result).not.toBeInstanceOf(Response);
		if (result instanceof Response) throw new Error('Unexpected redirect');
		expect(result.loaderData.home).toEqual({ method, header: 'present' });
	}
);

it('preserves request headers during action-owned loader revalidation while using read methods', async () => {
	const requests: { method: string; header: string | null }[] = [];
	const handler = createStaticHandler([
		{
			id: 'home',
			path: '/home',
			action: ({ request }) => {
				requests.push({ method: request.method, header: request.headers.get('x-input') });
				return 'saved';
			},
			loader: ({ request }) => {
				requests.push({ method: request.method, header: request.headers.get('x-input') });
				return 'data';
			}
		}
	]);
	await handler.query(
		new Request('https://example.test/home', {
			method: 'POST',
			headers: { 'x-input': 'present' },
			body: 'value'
		})
	);
	expect(requests).toEqual([
		{ method: 'POST', header: 'present' },
		{ method: 'GET', header: 'present' }
	]);
});
