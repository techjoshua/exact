/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { BLOCKED_JAVASCRIPT_URL } from '@exactjs/core';
import { changingUrl } from '../../component-composition-corpus/test-support/url-coercion.js';
import { renderTestTree } from './testing.js';
import { createOperation } from './test-support/native-operations.js';
import { unmount } from './root.js';
import { applyDomProp } from './props.js';

it.each(['primitive', 'string'] as const)(
	'retains checked URL values in DOM patches (%s)',
	(method) => {
		const anchor = document.createElement('a');
		for (const first of ['/safe?first=1&second=2', 'javascript:probe', '/next']) {
			const fixture = changingUrl(first, 'javascript:unchecked', method);
			applyDomProp(anchor, 'href', fixture.value);
			expect(anchor.getAttribute('href')).toBe(
				first.startsWith('/') ? first : BLOCKED_JAVASCRIPT_URL
			);
			expect(fixture.calls()).toBe(1);
		}
		applyDomProp(anchor, 'href', undefined);
		expect(anchor.hasAttribute('href')).toBe(false);
	}
);

it('retains the mounted anchor while checked URL values update and disappear', () => {
	const container = document.createElement('div');
	let anchor: Element | null = null;
	try {
		for (const first of ['/safe', 'javascript:probe', '/next']) {
			const fixture = changingUrl(first);
			renderTestTree(createOperation('a', { href: fixture.value }, 'Link'), container);
			const next = container.querySelector('a');
			if (anchor) expect(next).toBe(anchor);
			anchor = next;
			expect(anchor?.getAttribute('href')).toBe(
				first.startsWith('/') ? first : BLOCKED_JAVASCRIPT_URL
			);
			expect(fixture.calls()).toBe(1);
		}
		renderTestTree(createOperation('a', {}, 'Link'), container);
		expect(container.querySelector('a')).toBe(anchor);
		expect(anchor?.hasAttribute('href')).toBe(false);
	} finally {
		unmount(container);
	}
});
