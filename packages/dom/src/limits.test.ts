/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { createVNode } from './test-support/native-vnode.js';
import {
	createDomWorkBudget,
	DomTraversalLimitError,
	render,
	reserveDomWork,
	unmount,
	walkDomSubtree
} from './index.js';

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

	it('refuses an oversized reservation without partially consuming the shared budget', () => {
		const budget = createDomWorkBudget(3);
		reserveDomWork(budget, 2);

		expect(() => reserveDomWork(budget, 2)).toThrow(DomTraversalLimitError);
		expect(budget.used).toBe(2);
		expect(() => reserveDomWork(budget, -1)).toThrow(
			'DOM work reservation must be a non-negative safe integer'
		);
		expect(budget.used).toBe(2);
	});

	it('shares one traversal budget across independent DOM scans', () => {
		const first = document.createElement('section');
		first.innerHTML = '<span>A</span>';
		const second = document.createElement('section');
		second.innerHTML = '<span>B</span>';
		const budget = createDomWorkBudget(4);

		expect(walkDomSubtree(first, () => undefined, { budget })).toBe(3);
		expect(() => walkDomSubtree(second, () => undefined, { budget })).toThrow(
			'eXact DOM traversal exceeds the configured maximum of 4 nodes'
		);
	});

	it('can exclude the traversal root while still bounding its descendants', () => {
		const root = document.createElement('main');
		root.innerHTML = '<section><span>A</span></section>';
		const visited: Node[] = [];

		expect(
			walkDomSubtree(root, (node) => visited.push(node), {
				includeRoot: false,
				maxNodes: 3
			})
		).toBe(3);
		expect(visited).toEqual([
			root.firstElementChild,
			root.querySelector('span'),
			root.querySelector('span')!.firstChild
		]);
	});
});
