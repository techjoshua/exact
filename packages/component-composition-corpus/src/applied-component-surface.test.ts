import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it } from 'vitest';
import { appliedComponentRoot } from './test-support/applied-component-surface.fixtures.js';
import { appliedComponentRoot as serverRoot } from './test-support/applied-component-surface.fixtures.js?exact-target=server';

it.each(['mount', 'hydrate'] as const)(
	'preserves applied context capability during %s',
	async (mode) => {
		const container = document.createElement('div');
		const reports: unknown[] = [];
		try {
			if (mode === 'hydrate') {
				const output = await renderToHydratableString(serverRoot());
				container.innerHTML = output.html;
				const original = container.querySelector('output');
				hydrate(appliedComponentRoot(), container, {
					resumptions: output.resumptions,
					onMismatch: 'throw',
					onErrorReport: (r) => reports.push(r.error)
				});
				expect(container.querySelector('output')).toBe(original);
			} else
				render(appliedComponentRoot(), container, { onErrorReport: (r) => reports.push(r.error) });
			const variants = [...container.querySelectorAll('[data-applied-variant]')];
			expect(variants).toHaveLength(3);
			expect(variants.map((node) => node.textContent)).toEqual(['absent', 'absent', 'absent']);
			expect(reports).toEqual([]);
			unmount(container);
			expect(container.childNodes.length).toBe(0);
		} finally {
			unmount(container);
		}
	}
);
