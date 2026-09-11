/** @vitest-environment jsdom */
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import { hydrate } from './root.js';
import {
	textRunRoot,
	textRunState,
	textRunReads,
	releaseTextRun
} from './test-support/text-run.fixtures.js';
import { textRunRoot as serverRoot } from './test-support/text-run.fixtures.js?exact-target=server';

describe('compiler-owned scalar text runs', () => {
	it('recovers a mismatched text run and retains working bindings', async () => {
		const rendered = await renderToHydratableString(serverRoot('left', 'right'));
		const container = document.createElement('main');
		container.innerHTML = rendered.html;
		const previous = container.querySelector('small')!;
		previous.textContent = 'unexpected';
		const root = hydrate(textRunRoot('left', 'right'), container, {
			resumptions: rendered.resumptions
		});
		try {
			const small = container.querySelector('small')!;
			expect(small).not.toBe(previous);
			expect(small.textContent).toBe('left · right');
			textRunState().right = 'recovered';
			flushSync();
			expect(small.textContent).toBe('left · recovered');
		} finally {
			root.dispose();
			releaseTextRun();
		}
	});
	it.each([
		['Assigned', 'open'],
		['', ''],
		[null, undefined],
		[false, true],
		[0, -0],
		['A · B', 'C · D'],
		['<script>&', '\u2028😀漢字']
	] as const)('adopts %j and %j once with independent text identities', async (left, right) => {
		const rendered = await renderToHydratableString(serverRoot(left, right));
		const container = document.createElement('main');
		container.innerHTML = rendered.html;
		const small = container.querySelector('small')!;
		const first = small.firstChild;
		expect(small.innerHTML).not.toContain('<!--');
		releaseTextRun();
		const root = hydrate(textRunRoot(left, right), container, {
			resumptions: rendered.resumptions
		});
		try {
			expect(container.querySelector('small')).toBe(small);
			expect(small.firstChild).toBe(first);
			expect(small.childNodes).toHaveLength(3);
			expect(textRunReads()).toBe(1);
			const nodes = [...small.childNodes];
			textRunState().right = 'changed';
			flushSync();
			expect(textRunReads()).toBe(1);
			expect(nodes[2]!.textContent).toBe('changed');
			textRunState().left = 'updated';
			flushSync();
			expect(textRunReads()).toBe(2);
			expect(small.textContent).toBe('updated · changed');
			expect([...small.childNodes]).toEqual(nodes);
			expect(container.querySelector('b')!.textContent).toBe('after');
		} finally {
			root.dispose();
			releaseTextRun();
		}
	});

	it.each([
		['', ''],
		['\ud83d', '\ude00'],
		['😀', '漢字']
	])('splits adjoining values %j and %j at UTF-16 boundaries', async (left, right) => {
		const rendered = await renderToHydratableString(serverRoot(left, right, true));
		const container = document.createElement('main');
		container.innerHTML = rendered.html;
		const small = container.querySelector('small')!;
		expect(small.childNodes).toHaveLength(left || right ? 1 : 0);
		const root = hydrate(textRunRoot(left, right, true), container, {
			resumptions: rendered.resumptions
		});
		try {
			expect(container.querySelector('small')).toBe(small);
			expect(small.childNodes).toHaveLength(2);
			textRunState().right = 'right';
			flushSync();
			expect(small.firstChild!.textContent).toBe(left);
			expect(small.lastChild!.textContent).toBe('right');
		} finally {
			root.dispose();
			releaseTextRun();
		}
	});
});
