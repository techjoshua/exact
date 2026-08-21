/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/lists';
import '@exactjs/core/runtime/refs';
import {
	Activity,
	activateTaskForHost,
	defineTask,
	Fragment,
	Suspense,
	type Component,
	type RootLifecycle,
	type TaskContext,
	unsafeHtml
} from '@exactjs/core';
import { createDynamicChild, createServerSlot } from '@exactjs/core/runtime/render';
import './unsafe-html.js';
import './structural-boundaries.js';
import { createVNode } from './test-support/native-vnode.js';
import { flushSync } from '@exactjs/reactive';
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
		let lifecycle!: RootLifecycle<Element>;
		function Greeting(this: Component<Record<string, never>>) {
			lifecycle = this.refs.root();
			return () => createVNode('span', null, 'server');
		}
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:component:Greeting--><span>server</span><!--/exact:component:Greeting-->';
		const serverSpan = container.querySelector('span');
		const vnode = createVNode(Greeting, {});

		expect(adoptComponentRoot(vnode, container)).toBe(true);
		expect(container.querySelector('span')).toBe(serverSpan);
		expect(lifecycle.introduction).toBe('hydration');
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

	it('adopts active and parked Activity ranges without recreating server nodes', () => {
		const active = document.createElement('div');
		active.innerHTML =
			'<!--exact:root--><!--exact:activity:0--><p>ready</p><!--/exact:activity:0--><!--/exact:root-->';
		const paragraph = active.querySelector('p');
		expect(
			adoptStatic(
				createVNode(Activity, { mode: 'active' }, createVNode('p', null, 'ready')),
				active
			)
		).toBe(true);
		expect(active.querySelector('p')).toBe(paragraph);
		unmount(active);

		const parked = document.createElement('div');
		parked.innerHTML =
			'<!--exact:root--><!--exact:activity:0--><!--/exact:activity:0--><!--/exact:root-->';
		expect(
			adoptStatic(
				createVNode(Activity, { mode: 'parked' }, createVNode('p', null, 'prepared')),
				parked
			)
		).toBe(true);
		expect(parked.querySelector('p')).toBeNull();
		render(createVNode(Activity, { mode: 'active' }, createVNode('p', null, 'prepared')), parked);
		expect(parked.querySelector('p')?.textContent).toBe('prepared');
		unmount(parked);
	});

	it('adopts explicit Suspense content and fallback protocol states', async () => {
		const content = document.createElement('div');
		content.innerHTML =
			'<!--exact:root--><!--exact:suspense-content:0--><p>ready</p><!--/exact:suspense-content:0--><!--/exact:root-->';
		const paragraph = content.querySelector('p');
		expect(
			adoptStatic(
				createVNode(Suspense, { fallback: 'loading' }, createVNode('p', null, 'ready')),
				content
			)
		).toBe(true);
		expect(content.querySelector('p')).toBe(paragraph);
		unmount(content);

		let resolve!: () => void;
		const pending = new Promise<void>((settle) => {
			resolve = settle;
		});
		function Pending(this: Component<{}>) {
			activateTaskForHost(
				this,
				defineTask({ readiness: 'blocking' }, async (_task: TaskContext) => {
					await pending;
				})
			);
			return () => createVNode('p', null, 'ready');
		}
		const fallback = document.createElement('div');
		fallback.innerHTML =
			'<!--exact:root--><!--exact:suspense-fallback:0--><i>loading</i><!--/exact:suspense-fallback:0--><!--/exact:root-->';
		const indicator = fallback.querySelector('i');
		expect(
			adoptStatic(
				createVNode(
					Suspense,
					{ fallback: createVNode('i', null, 'loading') },
					createVNode(Pending, {})
				),
				fallback
			)
		).toBe(true);
		expect(fallback.querySelector('i')).toBe(indicator);
		resolve();
		for (let index = 0; index < 12; index++) {
			flushSync();
			await Promise.resolve();
			await Promise.resolve();
		}
		flushSync();
		expect(fallback.textContent).toBe('ready');
		unmount(fallback);
	});

	it('adopts keyed SSR ranges and preserves their DOM identity during reorder', () => {
		let list!: Component<{ items: { id: string; label: string }[] }>;
		function List(this: Component<{ items: { id: string; label: string }[] }>) {
			list = this;
			this.state.items = [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' }
			];
			return () =>
				this.map(
					this.state.items,
					(item) => item.id,
					(item) => createVNode('li', null, item.label),
					'tasks'
				);
		}
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:root--><!--exact:component:List--><!--exact:tasks--><!--exact:item:a--><li>A</li><!--/exact:item:a--><!--exact:item:b--><li>B</li><!--/exact:item:b--><!--/exact:tasks--><!--/exact:component:List--><!--/exact:root-->';
		const originalB = container.querySelectorAll('li')[1];

		expect(adoptStatic(createVNode(List, null), container)).toBe(true);
		list.state.items.reverse();
		flushSync();
		expect(container.querySelectorAll('li')[0]).toBe(originalB);
		expect(container.textContent).toBe('BA');
		expect(unmount(container)).toBe(true);
	});

	it('reuses server-rendered slot content instead of replacing it during client render', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<aside><span data-exact-server-slot="shell:children"><strong>Server child</strong></span></aside>';
		const slot = container.querySelector('[data-exact-server-slot="shell:children"]');
		const child = container.querySelector('strong');

		render(createVNode('main', null, createServerSlot('shell:children')), container);

		expect(container.querySelector('[data-exact-server-slot="shell:children"]')).toBe(slot);
		expect(container.querySelector('strong')).toBe(child);
		expect(container.textContent).toBe('Server child');
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
