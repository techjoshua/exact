import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import {
	mathPropertyOwner,
	nativeMathRoot
} from './test-support/native-mathml-properties.fixtures.js';
import { nativeMathRoot as serverRoot } from './test-support/native-mathml-properties.fixtures.js?exact-target=server';

it.each(['mount', 'hydrate'] as const)(
	'retains MathML attributes without DOM properties through %s',
	async (mode) => {
		const container = document.createElement('div');
		const reports: unknown[] = [];
		try {
			if (mode === 'hydrate') {
				const output = await renderToHydratableString(serverRoot());
				container.innerHTML = output.html;
				const original = container.querySelector('math');
				hydrate(nativeMathRoot(), container, {
					resumptions: output.resumptions,
					onMismatch: 'throw',
					onErrorReport: (r) => reports.push(r.error)
				});
				expect(container.querySelector('math')).toBe(original);
			} else render(nativeMathRoot(), container, { onErrorReport: (r) => reports.push(r.error) });
			const nodes = Array.from(container.querySelectorAll('math'));
			for (const [display, color, thickness] of [
				['block', 'red', '1px'],
				['inline', 'blue', '2px'],
				['block', 'red', '1px']
			]) {
				for (const node of nodes) {
					expect(node.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML');
					expect(node.getAttribute('display')).toBe(display);
					expect(node.getAttribute('mathcolor')).toBe(color);
					expect(node.querySelector('mfrac')?.getAttribute('linethickness')).toBe(thickness);
				}
				expect(Array.from(container.querySelectorAll('math'))).toEqual(nodes);
				container.querySelector('button')!.click();
				await vi.waitFor(() =>
					expect(mathPropertyOwner.state.display).toBe(display === 'block' ? 'inline' : 'block')
				);
			}
			unmount(container);
			mathPropertyOwner.state.color = 'green';
			flushSync();
			for (const node of nodes) expect(node.getAttribute('mathcolor')).toBe('blue');
			expect(container.childNodes.length).toBe(0);
			expect(reports).toEqual([]);
		} finally {
			unmount(container);
		}
	}
);
