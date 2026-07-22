/**
 * @vitest-environment jsdom
 */
import { createDynamicChild, createVNode, Fragment, type Component, unsafeHtml } from '@exact/core';
import { describe, expect, it, vi } from 'vitest';
import {
	adoptComponentRoot,
	adoptDocumentRoot,
	adoptMarkerlessComponentRoot,
	adoptStatic,
	render,
	unmount
} from './index.js';

describe('DOM adoption modes', () => {
	it('adopts a component boundary and keeps it live for later renders', () => {
		function Greeting(this: Component<Record<string, never>>) {
			return () => createVNode('span', null, 'server');
		}
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:component:Greeting--><span>server</span><!--/exact:component:Greeting-->';
		const serverSpan = container.querySelector('span');
		const vnode = createVNode(Greeting, {});

		expect(adoptComponentRoot(vnode, container)).toBe(true);
		expect(container.querySelector('span')).toBe(serverSpan);
		expect(adoptComponentRoot(vnode, container)).toBe(false);
		render(vnode, container);
		expect(container.textContent).toBe('server');
		expect(unmount(container)).toBe(true);
	});

	it('adopts markerless component output and removes temporary anchors on failure', () => {
		function Greeting(this: Component<{ text: string }>, props: { text: string }) {
			return () => createVNode('span', null, props.text);
		}
		const container = document.createElement('div');
		container.innerHTML = '<span>server</span>';

		expect(adoptMarkerlessComponentRoot(createVNode(Greeting, { text: 'server' }), container)).toBe(
			true
		);
		expect(container.querySelector('span')?.textContent).toBe('server');
		expect(unmount(container)).toBe(true);

		const mismatch = document.createElement('div');
		mismatch.innerHTML = '<b>wrong</b>';
		expect(
			adoptMarkerlessComponentRoot(createVNode(Greeting, { text: 'expected' }), mismatch)
		).toBe(false);
		expect(mismatch.childNodes).toHaveLength(1);
		expect(mismatch.firstChild).toBeInstanceOf(HTMLElement);
	});

	it('adopts unmarked fragments inside a root boundary', () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:root--><i>first</i><b>second</b><!--/exact:root-->';
		const first = container.querySelector('i');
		const vnode = createVNode(
			Fragment,
			null,
			createVNode('i', null, 'first'),
			createVNode('b', null, 'second')
		);

		expect(adoptStatic(vnode, container)).toBe(true);
		expect(container.querySelector('i')).toBe(first);
		expect(unmount(container)).toBe(true);
	});

	it('adopts dynamic and unsafe HTML ranges with their ownership policies', () => {
		const dynamicContainer = document.createElement('div');
		dynamicContainer.innerHTML =
			'<!--exact:root--><!--exact:dynamic:value-->current<!--/exact:dynamic:value--><!--/exact:root-->';
		expect(
			adoptStatic(
				createDynamicChild(() => 'current'),
				dynamicContainer
			)
		).toBe(true);
		expect(dynamicContainer.textContent).toBe('current');
		unmount(dynamicContainer);

		const unsafeContainer = document.createElement('div');
		unsafeContainer.innerHTML =
			'<!--exact:root--><!--exact:unsafe-html:value--><strong>trusted</strong><!--/exact:unsafe-html:value--><!--/exact:root-->';
		const observed = vi.fn();
		expect(
			adoptStatic(unsafeHtml('<strong>trusted</strong>'), unsafeContainer, {
				allowUnsafeHtml: true,
				onUnsafeHtml: observed
			})
		).toBe(true);
		expect(unsafeContainer.querySelector('strong')?.textContent).toBe('trusted');
		render(unsafeHtml('<em>changed</em>'), unsafeContainer, {
			allowUnsafeHtml: true,
			onUnsafeHtml: observed
		});
		expect(unsafeContainer.querySelector('em')?.textContent).toBe('changed');
		expect(observed).toHaveBeenCalled();
		unmount(unsafeContainer);
	});

	it('rejects missing, incomplete, and mismatched adoption boundaries', () => {
		const missing = document.createElement('div');
		missing.innerHTML = '<span>server</span>';
		expect(adoptStatic(createVNode('span', null, 'server'), missing)).toBe(false);

		const incomplete = document.createElement('div');
		incomplete.innerHTML = '<!--exact:root--><span>server</span>';
		expect(adoptStatic(createVNode('span', null, 'server'), incomplete)).toBe(false);

		const mismatch = document.createElement('div');
		mismatch.innerHTML = '<!--exact:root--><span>actual</span><!--/exact:root-->';
		expect(adoptStatic(createVNode('span', null, 'expected'), mismatch)).toBe(false);
	});

	it('adopts a complete HTML document without replacing its host nodes', () => {
		const documentNode = document.implementation.createHTMLDocument('Fixture');
		documentNode.body.innerHTML = '<main>server</main>';
		const html = documentNode.documentElement;
		const vnode = createVNode(
			'html',
			null,
			createVNode('head', null, createVNode('title', null, 'Fixture')),
			createVNode('body', null, createVNode('main', null, 'server'))
		);

		expect(adoptDocumentRoot(vnode, documentNode)).toBe(true);
		expect(documentNode.documentElement).toBe(html);
		expect(adoptDocumentRoot(vnode, documentNode)).toBe(false);
		expect(unmount(html)).toBe(true);
	});
});
