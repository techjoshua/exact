/** @vitest-environment jsdom */
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import { hydrate } from './root.js';
import {
	joinedTextRoot,
	joinedTextInstance,
	releaseJoinedTextInstance
} from './test-support/joined-text.fixtures.js';
import { joinedTextRoot as serverRoot } from './test-support/joined-text.fixtures.js?exact-target=server';

describe('joined scalar text hydration experiment', () => {
	it.each([
		['Assigned · ', 'open', 'Assigned · open'],
		['', '', ''],
		[null, undefined, ''],
		[false, true, ''],
		[0, -0, '00'],
		['<script>&', '\u2028\ud83d\ude00', '<script>&\u2028\ud83d\ude00']
	] as const)('claims one markerless text child from %j and %j', async (left, right, expected) => {
		const rendered = await renderToHydratableString(serverRoot(left, right));
		const container = document.createElement('main');
		container.innerHTML = rendered.html;
		const small = container.querySelector('small')!;
		expect(small.innerHTML).not.toContain('<!--');
		expect(small.textContent).toBe(expected);
		const previousText = small.firstChild;
		const root = hydrate(joinedTextRoot(left, right), container, {
			resumptions: rendered.resumptions
		});
		try {
			expect(container.querySelector('small')).toBe(small);
			expect(small.childNodes).toHaveLength(1);
			const textNode = small.firstChild;
			expect(textNode).toBeInstanceOf(Text);
			if (previousText) expect(textNode).toBe(previousText);
			const state = joinedTextInstance().state;
			state.left = 'new ';
			flushSync();
			expect(small.textContent).toBe(
				'new ' + (right == null || typeof right === 'boolean' ? '' : String(right))
			);
			state.right = 'value';
			flushSync();
			expect(small.textContent).toBe('new value');
			state.left = null;
			state.right = false;
			flushSync();
			expect(small.textContent).toBe('');
			expect(small.firstChild).toBe(textNode);
			expect(small.childNodes).toHaveLength(1);
		} finally {
			root.dispose();
			releaseJoinedTextInstance();
		}
	});
});
