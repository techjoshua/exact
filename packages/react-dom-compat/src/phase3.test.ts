/**
 * @vitest-environment jsdom
 */
import {
	Activity,
	act,
	cache,
	createElement,
	useActionState,
	useOptimistic
} from '@exactjs/react-compat';
import { c } from '@exactjs/react-compat/compiler-runtime';
import { describe, expect, it, vi } from 'vitest';
import { createRoot } from './client.js';
import { preconnect, preinitModule, preload, requestFormReset, useFormStatus } from './index.js';

describe('React compatibility Phase 3', () => {
	it('memoizes cache results and exposes compiler memo slots', async () => {
		const calculate = vi.fn((value: number) => ({ value }));
		const cached = cache(calculate);
		expect(cached(2)).toBe(cached(2));
		expect(calculate).toHaveBeenCalledTimes(1);
		let firstCache: unknown[] | undefined;
		function CompiledView() {
			const memo = c(2);
			firstCache ??= memo;
			return createElement('span', null, String(memo === firstCache));
		}
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() => root.render(createElement(CompiledView, null)));
		await act(() => root.render(createElement(CompiledView, null)));
		expect(container.textContent).toBe('true');
	});

	it('runs action and optimistic hooks and resets optimistic state from passthrough props', async () => {
		function Actions(props: { base: number }) {
			const [state, dispatch, pending] = useActionState(
				async (previous: number, amount: number) => previous + amount,
				0
			);
			const [optimistic, updateOptimistic] = useOptimistic(
				props.base,
				(previous, amount: number) => previous + amount
			);
			const status = useFormStatus();
			return createElement(
				'div',
				null,
				createElement(
					'button',
					{ id: 'action', onClick: () => dispatch(2) },
					`${state}/${pending}`
				),
				createElement(
					'button',
					{ id: 'optimistic', onClick: () => updateOptimistic(3) },
					String(optimistic)
				),
				createElement('output', null, String(status.pending))
			);
		}
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() => root.render(createElement(Actions, { base: 1 })));
		await act(() => container.querySelector<HTMLElement>('#action')!.click());
		expect(container.querySelector('#action')?.textContent).toBe('2/false');
		await act(() => container.querySelector<HTMLElement>('#optimistic')!.click());
		expect(container.querySelector('#optimistic')?.textContent).toBe('4');
		await act(() => root.render(createElement(Actions, { base: 10 })));
		expect(container.querySelector('#optimistic')?.textContent).toBe('10');
		expect(container.querySelector('output')?.textContent).toBe('false');
	});

	it('supports Activity visibility, resource hints, and form reset', async () => {
		document.head.replaceChildren();
		preconnect('https://cdn.example', { crossOrigin: 'anonymous' });
		preconnect('https://cdn.example', { crossOrigin: 'anonymous' });
		preload('/app.css', { as: 'style' });
		preinitModule('/app.js');
		expect(document.head.querySelectorAll('link[rel=preconnect]')).toHaveLength(1);
		expect(document.head.querySelector('link[rel=preload]')?.getAttribute('as')).toBe('style');
		expect(document.head.querySelector('script[type=module]')?.getAttribute('src')).toContain(
			'/app.js'
		);

		const form = document.createElement('form');
		const input = document.createElement('input');
		input.defaultValue = 'initial';
		input.value = 'changed';
		form.appendChild(input);
		requestFormReset(form);
		expect(input.value).toBe('initial');

		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() =>
			root.render(
				createElement(Activity, { mode: 'hidden' }, createElement('span', null, 'hidden'))
			)
		);
		expect(container.textContent).toBe('');
		await act(() =>
			root.render(
				createElement(Activity, { mode: 'visible' }, createElement('span', null, 'visible'))
			)
		);
		expect(container.textContent).toBe('visible');
	});
});
