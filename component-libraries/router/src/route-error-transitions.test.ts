/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { act, createElement, useState } from '@exactjs/react-compat';
import { createRoot } from '@exactjs/react-dom-compat/client19';
import { createMemoryRouter, RouterProvider, useRouteError } from './modern.js';

it('preserves local hook values when one component serves normal and error route output', async () => {
	let failure = false;
	function Page() {
		const error = useRouteError();
		const [local] = useState('local');
		return createElement('p', {}, `${error instanceof Error ? 'error' : 'normal'}:${local}`);
	}
	const element = createElement(Page);
	const router = createMemoryRouter([
		{
			id: 'home',
			path: '/',
			loader: () => {
				if (failure) throw new Error('expected');
				return 'ok';
			},
			element,
			errorElement: element
		}
	]);
	const container = document.createElement('div');
	const root = createRoot(container);
	try {
		await act(async () => {
			await router.initialize();
			root.render(createElement(RouterProvider, { router }));
		});
		expect(container.textContent).toBe('normal:local');
		failure = true;
		await act(async () => {
			await router.revalidate();
		});
		expect(container.textContent).toBe('error:local');
		failure = false;
		await act(async () => {
			await router.revalidate();
		});
		expect(container.textContent).toBe('normal:local');
	} finally {
		await act(async () => root.unmount());
		router.dispose();
	}
});
