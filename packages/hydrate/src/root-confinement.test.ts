/**
 * @vitest-environment jsdom
 */
import { createComponentDomain, withComponentDomain, type Component } from '@exactjs/core';
import { createVNode } from './test-support/native-vnode.js';
import { render, unmount } from '@exactjs/dom';
import { describe, expect, it, vi } from 'vitest';
import { applyPatches } from './patches.js';

describe('execution-root patch confinement', () => {
	it('selects only targets owned by the issuing root when local ids collide', () => {
		const container = document.createElement('div');
		const page = createComponentDomain('page');
		const remote = createComponentDomain('@company/billing#./Area');
		function Label(this: Component<{}>, props: { value: string }) {
			return () => createVNode('span', { 'data-exact-id': 'title' }, props.value);
		}
		function Host() {
			return () =>
				createVNode(
					'section',
					null,
					withComponentDomain(page, () => createVNode(Label, { value: 'Page' })),
					withComponentDomain(remote, () => createVNode(Label, { value: 'Remote' }))
				);
		}
		render(createVNode(Host, null), container);

		expect(
			applyPatches(container, [{ type: 'text', id: 'title', value: 'Updated' }], {
				executionRoot: '@company/billing#./Area'
			})
		).toBe(true);
		expect(Array.from(container.querySelectorAll('span'), (span) => span.textContent)).toEqual([
			'Page',
			'Updated'
		]);
		unmount(container);
	});

	it('reports a structural patch that replaces an ancestor of a foreign-root child', () => {
		const container = document.createElement('div');
		const page = createComponentDomain('page');
		const remote = createComponentDomain('@company/brand#./Shell');
		function PageChild() {
			return () => createVNode('strong', { 'data-page-child': '' }, 'Page');
		}
		const pageChild = withComponentDomain(page, () => createVNode(PageChild, null));
		function Shell() {
			return () => createVNode('section', { 'data-exact-id': 'shell' }, pageChild);
		}
		const tree = withComponentDomain(remote, () => createVNode(Shell, null));
		render(tree, container);
		const onCrossRootReplacement = vi.fn();

		expect(
			applyPatches(
				container,
				[{ type: 'replace', id: 'shell', html: '<section data-exact-id="shell"></section>' }],
				{ executionRoot: '@company/brand#./Shell', onCrossRootReplacement }
			)
		).toBe(true);
		expect(onCrossRootReplacement).toHaveBeenCalledOnce();
		unmount(container);
	});
});
