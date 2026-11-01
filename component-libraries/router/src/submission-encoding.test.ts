/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { act, createElement } from '@exactjs/react-compat';
import { createRoot } from '@exactjs/react-dom-compat/client19';
import { createMemoryRouter, RouterProvider, useSubmit } from './modern.js';

it('honors requested JSON and text submission bodies while retaining URL-encoded defaults', async () => {
	let submit: ReturnType<typeof useSubmit> | undefined;
	let result: { type: string; body: string } | undefined;
	function Page() {
		submit = useSubmit();
		return null;
	}
	const router = createMemoryRouter(
		[
			{
				id: 'home',
				path: '/home',
				Component: Page,
				action: async ({ request }) => {
					result = { type: request.headers.get('content-type') ?? '', body: await request.text() };
					return 'ok';
				}
			}
		],
		{ initialEntries: ['/home'] }
	);
	const container = document.createElement('main');
	const root = createRoot(container);
	try {
		await router.initialize();
		await act(() => root.render(createElement(RouterProvider, { router })));
		await act(() => submit!({ value: 'one' }, { method: 'POST', encType: 'application/json' }));
		expect(result?.type).toBe('application/json');
		expect(JSON.parse(result!.body)).toEqual({ value: 'one' });
		await act(() => submit!({ value: 'one' }, { method: 'POST', encType: 'text/plain' }));
		expect(result?.type).toBe('text/plain;charset=UTF-8');
		expect(result?.body).toBe('value=one\r\n');
		await act(() => submit!({ value: 'one' }, { method: 'POST' }));
		expect(result?.type.startsWith('application/x-www-form-urlencoded')).toBe(true);
		expect(result?.body).toBe('value=one');
	} finally {
		await act(() => root.unmount());
		router.dispose();
	}
});
