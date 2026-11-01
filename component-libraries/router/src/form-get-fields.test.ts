/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { act, createElement } from '@exactjs/react-compat';
import { createRoot } from '@exactjs/react-dom-compat/client19';
import { createMemoryRouter, RouterProvider, useFetcher } from './modern.js';
import { formDataSearchParams } from './modern/browser.js';

it('serializes GET file fields as filenames while retaining ordinary and repeated fields', () => {
	const data = new FormData();
	data.append('file', new File(['private contents'], 'a&b.txt'));
	data.append('value', 'first');
	data.append('value', 'second');
	const fields = formDataSearchParams(data);
	const browser = new URLSearchParams();
	browser.append('file', 'a&b.txt');
	browser.append('value', 'first');
	browser.append('value', 'second');
	expect(fields.toString()).toBe(browser.toString());
	expect(data.get('file')).toBeInstanceOf(File);
});

it('retains an index target during fetcher GET field replacement without mutating input parameters', async () => {
	let fetcher: ReturnType<typeof useFetcher> | undefined;
	const calls: string[] = [];
	function Page() {
		fetcher = useFetcher<string>();
		return createElement('output', null, String(fetcher.data ?? ''));
	}
	const router = createMemoryRouter(
		[
			{
				id: 'parent',
				path: '/data',
				loader: () => {
					calls.push('parent');
					return 'parent';
				},
				children: [
					{
						id: 'index',
						index: true,
						Component: Page,
						loader: ({ request }) => {
							calls.push('index');
							return new URL(request.url).search;
						}
					}
				]
			}
		],
		{ initialEntries: ['/data?discard=one'] }
	);
	const container = document.createElement('main');
	const root = createRoot(container);
	try {
		await router.initialize();
		await act(() => root.render(createElement(RouterProvider, { router })));
		calls.length = 0;
		const input = new URLSearchParams('value=one&index=customer');
		await act(() => fetcher!.submit(input, { method: 'GET' }));
		expect(calls).toEqual(['index']);
		const result = new URLSearchParams(container.textContent!);
		expect(result.getAll('index')).toEqual(['customer', '']);
		expect(result.get('value')).toBe('one');
		expect(result.has('discard')).toBe(false);
		expect(input.toString()).toBe('value=one&index=customer');
	} finally {
		await act(() => root.unmount());
		router.dispose();
	}
});
