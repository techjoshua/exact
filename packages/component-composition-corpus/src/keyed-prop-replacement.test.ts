import { dispose, render } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it, onTestFinished } from 'vitest';
import { hoverRoot } from './test-support/keyed-prop-replacement.fixtures.js';
import { hoverRoot as serverRoot } from './test-support/keyed-prop-replacement.fixtures.js?exact-target=server';

for (const entry of ['mount', 'hydrate']) {
	for (const replaceFirst of [false, true]) {
		it(`${entry}: follows independent props after projected row replacement (${replaceFirst})`, async () => {
			const container = document.createElement('div');
			document.body.append(container);
			onTestFinished(() => {
				dispose(container, true);
				container.remove();
			});
			if (entry === 'hydrate') {
				const server = await renderToHydratableString(serverRoot());
				container.innerHTML = server.html;
				const rows = [...container.querySelectorAll('li')];
				hydrate(hoverRoot(), container, { resumptions: server.resumptions, onMismatch: 'throw' });
				expect([...container.querySelectorAll('li')]).toEqual(rows);
			} else render(hoverRoot(), container);
			const retained = container.querySelectorAll('li')[1];
			const click = (name: string) => {
				[...container.querySelectorAll('button')]
					.find((button) => button.textContent === name)!
					.click();
				flushSync();
			};
			if (replaceFirst) click('Replace');
			click('Hover');
			expect(container.querySelector('output')?.textContent).toBe('2');
			expect(container.querySelector('li[data-lit="true"]')).toBe(retained);
			click('Replace');
			expect(container.querySelector('li[data-lit="true"]')).toBe(retained);
			click('Next hover');
			expect(container.querySelector('li[data-lit="true"]')?.textContent).toBe('3');
			expect(retained.matches('[data-lit="true"]')).toBe(false);
			click('Clear');
			expect(container.querySelectorAll('li')).toHaveLength(0);
			expect(retained.isConnected).toBe(false);
			click('Hover');
			click('Replace');
			expect(container.querySelector('li[data-lit="true"]')?.textContent).toBe('2');
			expect(container.querySelector('li[data-lit="true"]')).not.toBe(retained);
		});
	}
}
