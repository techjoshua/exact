import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import {
	conditionalClassOwner,
	conditionalClassRoot
} from './test-support/conditional-class-keys.fixtures.js';
import { conditionalClassRoot as serverRoot } from './test-support/conditional-class-keys.fixtures.js?exact-target=server';

it.each(['mount', 'hydrate'] as const)(
	'preserves prototype-named conditional class tokens during %s',
	async (mode) => {
		const container = document.createElement('div');
		const reports: unknown[] = [];
		try {
			if (mode === 'hydrate') {
				const output = await renderToHydratableString(serverRoot());
				container.innerHTML = output.html;
				for (const node of container.querySelectorAll('[data-class-keys]'))
					expect(node.getAttribute('class')).toBe('base __proto__ constructor prototype');
				const original = container.querySelector('[data-class-keys]');
				hydrate(conditionalClassRoot(), container, {
					resumptions: output.resumptions,
					onMismatch: 'throw',
					onErrorReport: (r) => reports.push(r.error)
				});
				expect(container.querySelector('[data-class-keys]')).toBe(original);
			} else
				render(conditionalClassRoot(), container, { onErrorReport: (r) => reports.push(r.error) });
			const nodes = Array.from(container.querySelectorAll('[data-class-keys]'));
			for (const expected of [
				'base __proto__ constructor prototype',
				'base',
				'base __proto__ constructor prototype'
			]) {
				for (const node of nodes) expect(node.getAttribute('class')).toBe(expected);
				expect(Array.from(container.querySelectorAll('[data-class-keys]'))).toEqual(nodes);
				container.querySelector('button')!.click();
				await vi.waitFor(() =>
					expect(conditionalClassOwner.state.active).toBe(!expected.includes('__proto__'))
				);
			}
			unmount(container);
			conditionalClassOwner.state.active = true;
			flushSync();
			expect(container.childNodes.length).toBe(0);
			for (const node of nodes) expect(node.getAttribute('class')).toBe('base');
			expect(reports).toEqual([]);
		} finally {
			unmount(container);
		}
	}
);
