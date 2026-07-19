/**
 * @vitest-environment jsdom
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Suspense, act, createElement } from '@exact/react-compat';
import { createRoot } from './client.js';

let Dialog: any;
let ThemeProvider: any;
let useTheme: any;
let QueryClient: any;
let QueryClientProvider: any;
let useQuery: any;

beforeAll(async () => {
	({ Dialog, ThemeProvider, useTheme, QueryClient, QueryClientProvider, useQuery } = await import(
		'../fixtures/phase3.mjs'
	));
});

describe('React compatibility Phase 3 package fixtures', () => {
	it('opens and cleans up a Radix Dialog portal', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		await act(() =>
			root.render(
				createElement(
					Dialog.Root,
					null,
					createElement(Dialog.Trigger, null, 'open'),
					createElement(
						Dialog.Portal,
						null,
						createElement(Dialog.Overlay, { 'data-testid': 'overlay' }),
						createElement(
							Dialog.Content,
							null,
							createElement(Dialog.Title, null, 'Dialog title'),
							createElement(Dialog.Close, null, 'close')
						)
					)
				)
			)
		);
		await act(() => container.querySelector('button')!.click());
		expect(document.body.textContent).toContain('Dialog title');
		expect(document.body.querySelector('[role=dialog]')).not.toBeNull();
		await act(() =>
			Array.from(document.body.querySelectorAll('button'))
				.find((button) => button.textContent === 'close')!
				.click()
		);
		expect(document.body.textContent).not.toContain('Dialog title');
		root.unmount();
		expect(document.body.textContent).not.toContain('Dialog title');
		container.remove();
	});

	it('runs Emotion context and insertion-effect setup', async () => {
		function ThemeValue() {
			const theme = useTheme();
			return createElement('span', null, theme.brand);
		}
		const container = document.createElement('div');
		await act(() =>
			createRoot(container).render(
				createElement(
					ThemeProvider,
					{ theme: { brand: 'exact-blue' } },
					createElement(ThemeValue, null)
				)
			)
		);
		expect(container.textContent).toBe('exact-blue');
	});

	it('resolves a suspense-enabled TanStack Query', async () => {
		let resolve!: (value: string) => void;
		const result = new Promise<string>((settle) => {
			resolve = settle;
		});
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		function QueryValue() {
			const query = useQuery({ queryKey: ['phase3'], queryFn: () => result, suspense: true });
			return createElement('span', null, query.data);
		}
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() =>
			root.render(
				createElement(
					QueryClientProvider,
					{ client },
					createElement(Suspense, { fallback: 'query-loading' }, createElement(QueryValue, null))
				)
			)
		);
		expect(container.textContent).toBe('query-loading');
		resolve('query-ready');
		await result;
		await act(async () => {
			await Promise.resolve();
		});
		expect(container.textContent).toBe('query-ready');
		root.unmount();
	});
});
