/**
 * @vitest-environment jsdom
 */
import { createVNode } from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { render, unmount } from './index.js';

describe('@exactjs/dom limits', () => {
	it('rejects over-deep vnode trees without mounting a partial root', () => {
		let vnode = createVNode('span', null, 'leaf');
		for (let depth = 0; depth < 20; depth++) vnode = createVNode('div', null, vnode);
		const container = document.createElement('div');

		expect(() => render(vnode, container, { maxTreeDepth: 8 })).toThrow(
			'eXact DOM tree exceeds the configured maximum depth of 8'
		);
		expect(container.childNodes).toHaveLength(0);
		expect(unmount(container)).toBe(true);
	});

	it('rejects over-broad vnode and placeholder trees without mounting a partial root', () => {
		const children = Array.from({ length: 20 }, (_, index) =>
			index % 2 ? null : createVNode('span', null, String(index))
		);
		const container = document.createElement('div');

		expect(() =>
			render(createVNode('main', null, ...children), container, { maxTreeNodes: 8 })
		).toThrow('eXact DOM update exceeds the configured maximum of 8 render values');
		expect(container.childNodes).toHaveLength(0);
		expect(unmount(container)).toBe(true);
	});

	it('applies the DOM work budget per update rather than across the root lifetime', () => {
		const container = document.createElement('div');
		const vnode = createVNode('p', null, 'stable');
		for (let update = 0; update < 100; update++) {
			expect(() => render(vnode, container, { maxTreeNodes: 20 })).not.toThrow();
		}
		expect(container.textContent).toBe('stable');
	});
});
