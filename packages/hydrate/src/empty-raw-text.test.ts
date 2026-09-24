// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from './index.js';
import { emptyRawTextRoot } from './test-support/empty-raw-text.fixtures.js';
import { emptyRawTextRoot as serverRoot } from './test-support/empty-raw-text.fixtures.js?exact-target=server';

it.each(['style', 'script'] as const)(
	'adopts empty %s content and retains later transitions',
	async (tag) => {
		const rendered = await renderToHydratableString(serverRoot(tag));
		const container = document.createElement('div');
		container.innerHTML = rendered.html;
		const host = container.querySelector(tag)!;
		const input = container.querySelector('input')!;
		const button = container.querySelector('button')!;
		input.value = 'Edited before hydration';
		const mounted = hydrate(emptyRawTextRoot(tag), container, {
			onMismatch: 'throw',
			resumptions: rendered.resumptions
		});
		try {
			expect(container.querySelector(tag)).toBe(host);
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('Edited before hydration');
			button.click();
			flushSync();
			expect(host.textContent).toBe(tag === 'style' ? 'p{color:red}' : '{"active":true}');
			button.click();
			flushSync();
			expect(host.textContent).toBe('');
			expect(container.querySelector(tag)).toBe(host);
		} finally {
			mounted.dispose();
		}
		button.click();
		flushSync();
		expect(container.querySelector(tag)).toBeNull();
	}
);
