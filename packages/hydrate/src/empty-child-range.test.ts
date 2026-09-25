// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from './index.js';
import { emptyChildRangeRoot } from './test-support/empty-child-range.fixtures.js';
import { emptyChildRangeRoot as serverRoot } from './test-support/empty-child-range.fixtures.js?exact-target=server';

it('adopts parser-elided empty child text and retains adjacent input state across transitions', async () => {
	const rendered = await renderToHydratableString(serverRoot());
	const container = document.createElement('main');
	container.innerHTML = rendered.html;
	const host = container.querySelector('section')!;
	const range = container.querySelector('[data-range]')!;
	const input = container.querySelector('input')!;
	const button = container.querySelector('button')!;
	input.value = 'Edited';
	const mounted = hydrate(emptyChildRangeRoot(), container, {
		onMismatch: 'throw',
		resumptions: rendered.resumptions
	});
	try {
		expect(container.querySelector('section')).toBe(host);
		for (const text of ['Visible', '', 'Visible']) {
			button.click();
			flushSync();
			expect(container.querySelector('[data-range]')).toBe(range);
			expect(range.textContent).toBe(text);
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('Edited');
		}
	} finally {
		mounted.dispose();
	}
	button.click();
	flushSync();
	expect(button.textContent).toBe('Toggle 3');
});

it('does not accept unexpected content as a parser-elided empty child', async () => {
	const rendered = await renderToHydratableString(serverRoot());
	const container = document.createElement('main');
	container.innerHTML = rendered.html;
	const range = container.querySelector('[data-range]')!;
	range.insertBefore(document.createTextNode('Unexpected'), range.lastChild);
	const mounted = hydrate(emptyChildRangeRoot(), container, { resumptions: rendered.resumptions });
	try {
		expect(container.querySelector('[data-range]')!.textContent).toBe('');
	} finally {
		mounted.dispose();
	}
});
