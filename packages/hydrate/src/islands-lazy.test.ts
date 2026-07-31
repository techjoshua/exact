/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { hydrateClientIslands, lazyClientIsland } from './index.js';
import { createVNode, markTestComponent } from './test-support/native-vnode.js';

describe('@exactjs/hydrate lazy islands', () => {
	it('loads an interaction island once and replays ordered invocations after adoption', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction" data-exact-client-generation="1"><button data-exact-id="counter-button">Count</button></div>';
		let clicks = 0;
		let loads = 0;
		let resolveLoad!: (component: typeof Counter) => void;
		const loaded = new Promise<typeof Counter>((resolve) => {
			resolveLoad = resolve;
		});
		function Counter() {
			return () =>
				createVNode(
					'button',
					{ 'data-exact-id': 'counter-button', onClick: () => clicks++ },
					'Count'
				);
		}
		markTestComponent(Counter);

		hydrateClientIslands(container, {
			Counter: lazyClientIsland(() => {
				loads++;
				return loaded;
			})
		});
		const button = container.querySelector('button')!;
		button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(loads).toBe(1);
		expect(clicks).toBe(0);
		resolveLoad(Counter);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(clicks).toBe(2);
		expect(container.querySelector('button')).toBe(button);
	});

	it('coalesces state-like interactions while a lazy island loads', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="form" data-exact-client-name="Form" data-exact-client-hydration="interaction"><input data-exact-id="name"></div>';
		const values: string[] = [];
		let resolveLoad!: (component: typeof Form) => void;
		const loaded = new Promise<typeof Form>((resolve) => {
			resolveLoad = resolve;
		});
		function Form() {
			return () =>
				createVNode('input', {
					'data-exact-id': 'name',
					onInput: (event: Event) => values.push((event.currentTarget as HTMLInputElement).value)
				});
		}
		markTestComponent(Form);

		hydrateClientIslands(container, {
			Form: lazyClientIsland(() => loaded)
		});
		const input = container.querySelector('input')!;
		input.value = 'a';
		input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
		input.value = 'latest';
		input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
		resolveLoad(Form);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(values).toEqual(['latest']);
		expect(container.querySelector('input')).toBe(input);
	});
});
