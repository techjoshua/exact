import { getCellVNode, isCellVNode } from '@exactjs/core/runtime/render';
import { describe, expect, it } from 'vitest';
import { _, Fragment, jsx, jsxs } from './jsx-runtime.js';

describe('@exactjs/jsx', () => {
	it('creates vnodes and normalizes children', () => {
		const vnode = jsxs('ul', {
			children: [jsx('li', { children: 'A' }), jsx('li', { children: 'B' })]
		});

		expect(isCellVNode(vnode)).toBe(true);
		if (!isCellVNode(vnode)) throw new Error('Expected cell vnode');
		const inner = getCellVNode(vnode);
		expect(inner.type).toBe('ul');
		expect(inner.children).toHaveLength(2);
		expect(inner.children.every(isCellVNode)).toBe(true);
	});

	it('supports fragments', () => {
		const vnode = jsxs(Fragment, { children: ['a', 'b'] });
		expect(isCellVNode(vnode)).toBe(true);
		if (!isCellVNode(vnode)) throw new Error('Expected cell vnode');
		const inner = getCellVNode(vnode);
		expect(inner.type).toBe(Fragment);
		expect(inner.children).toEqual(['a', 'b']);
	});

	it('exports underscore as the keyed fragment JSX marker', () => {
		expect(_).toBe(Fragment);
	});

	it('preserves an explicitly empty key', () => {
		const vnode = jsx('li', { children: 'empty key' }, '');
		expect(isCellVNode(vnode)).toBe(true);
		if (!isCellVNode(vnode)) throw new Error('Expected cell vnode');
		expect(getCellVNode(vnode).key).toBe('');
	});

	it('extracts an authored key without retaining it as an ordinary prop', () => {
		const vnode = jsx('li', { children: 'authored key', key: 'item' });
		expect(isCellVNode(vnode)).toBe(true);
		if (!isCellVNode(vnode)) throw new Error('Expected cell vnode');
		const inner = getCellVNode(vnode);
		expect(inner.key).toBe('item');
		expect(inner.props).not.toHaveProperty('key');
	});
});
