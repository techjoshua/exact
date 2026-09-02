/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/lists';
import '@exactjs/core/runtime/refs';
import './runtime/root-release.js';
import {
	Activity,
	activateTaskForHost,
	defineTask,
	encodeExactMarkerPart,
	Suspense,
	type Component,
	type TaskContext,
	unsafeHtml
} from '@exactjs/core';
import { exactComponentIdentity } from '@exactjs/core/framework/component-contracts';
import { readCompiledComponentReceipt } from '@exactjs/core/runtime/component-abi';
import { createDynamicChild, createServerSlot } from '@exactjs/core/runtime/render';
import './unsafe-html.js';
import './structural-boundaries.js';
import { createTestComponentReceipt, createOperation } from './test-support/native-operations.js';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import {
	adoptComponentRoot,
	adoptDocumentRoot,
	adoptMarkerlessComponentReceiptRoot,
	adoptMarkerlessComponentRoot,
	adoptStatic
} from './test-support/adoption.js';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';
import {
	DocumentAdoptionRoot,
	FragmentAdoptionRoot,
	HydratedGreeting,
	KeyedAdoptionList,
	MarkerlessGreeting,
	hydratedGreetingLifecycle,
	keyedAdoptionListInstance
} from './adoption-modes.fixtures.js';

describe('DOM adoption modes', () => {
	it('adopts a component boundary and keeps it live for later renders', () => {
		const container = document.createElement('div');
		const vnode = createTestComponentReceipt(HydratedGreeting, {});
		const marker = `exact:component:0:${encodeExactMarkerPart(exactComponentIdentity(HydratedGreeting))}`;
		container.innerHTML = `<!--${marker}--><span>server</span><!--/${marker}-->`;
		const serverSpan = container.querySelector('span');

		expect(adoptComponentRoot(vnode, container)).toBe(true);
		expect(container.querySelector('span')).toBe(serverSpan);
		expect(hydratedGreetingLifecycle().introduction).toBe('hydration');
		expect(adoptComponentRoot(vnode, container)).toBe(false);
		render(vnode, container);
		expect(container.textContent).toBe('server');
		expect(unmount(container)).toBe(true);
	});

	it('adopts markerless component output and removes temporary anchors on failure', () => {
		const container = document.createElement('div');
		container.innerHTML = '<span>server</span>';

		expect(
			adoptMarkerlessComponentRoot(
				createTestComponentReceipt(MarkerlessGreeting, { text: 'server' }),
				container
			)
		).toBe(true);
		expect(container.querySelector('span')?.textContent).toBe('server');
		expect(unmount(container)).toBe(true);

		const mismatch = document.createElement('div');
		mismatch.innerHTML = '<b>wrong</b>';
		expect(
			adoptMarkerlessComponentRoot(
				createTestComponentReceipt(MarkerlessGreeting, { text: 'expected' }),
				mismatch
			)
		).toBe(false);
		expect(mismatch.childNodes).toHaveLength(1);
		expect(mismatch.firstChild).toBeInstanceOf(HTMLElement);
	});

	it('adopts an opaque markerless component operation without a component VNode', () => {
		const operation = createTestComponentReceipt(MarkerlessGreeting, { text: 'server' });
		const receipt = readCompiledComponentReceipt(operation)!;
		const container = document.createElement('div');
		container.innerHTML = '<span>server</span>';

		expect(adoptMarkerlessComponentReceiptRoot(operation, receipt, container)).toBe(true);
		expect(container.querySelector('span')?.textContent).toBe('server');
		expect(unmount(container)).toBe(true);
	});

	it('adopts a compiler-owned fragment range inside a markerless component root', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:fragment:0--><i>first</i><b>second</b><!--/exact:fragment:0-->';
		const first = container.querySelector('i');
		const vnode = createTestComponentReceipt(FragmentAdoptionRoot, {});

		expect(adoptMarkerlessComponentRoot(vnode, container)).toBe(true);
		expect(container.querySelector('i')).toBe(first);
		expect(unmount(container)).toBe(true);
	});

	it('adopts active and parked Activity ranges without recreating server nodes', () => {
		const active = document.createElement('div');
		active.innerHTML =
			'<!--exact:dynamic:test-root--><!--exact:activity:0--><p>ready</p><!--/exact:activity:0--><!--/exact:dynamic:test-root-->';
		const paragraph = active.querySelector('p');
		expect(
			adoptStatic(
				createOperation(Activity, { mode: 'active' }, createOperation('p', null, 'ready')),
				active
			)
		).toBe(true);
		expect(active.querySelector('p')).toBe(paragraph);
		unmount(active);

		const parked = document.createElement('div');
		parked.innerHTML =
			'<!--exact:dynamic:test-root--><!--exact:activity:0--><!--/exact:activity:0--><!--/exact:dynamic:test-root-->';
		expect(
			adoptStatic(
				createOperation(Activity, { mode: 'parked' }, createOperation('p', null, 'prepared')),
				parked
			)
		).toBe(true);
		expect(parked.querySelector('p')).toBeNull();
		render(
			createOperation(Activity, { mode: 'active' }, createOperation('p', null, 'prepared')),
			parked
		);
		expect(parked.querySelector('p')?.textContent).toBe('prepared');
		unmount(parked);
	});

	it('adopts explicit Suspense content and fallback protocol states', async () => {
		const content = document.createElement('div');
		content.innerHTML =
			'<!--exact:dynamic:test-root--><!--exact:suspense-content:0--><p>ready</p><!--/exact:suspense-content:0--><!--/exact:dynamic:test-root-->';
		const paragraph = content.querySelector('p');
		expect(
			adoptStatic(
				createOperation(Suspense, { fallback: 'loading' }, createOperation('p', null, 'ready')),
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
			return () => createOperation('p', null, 'ready');
		}
		const fallback = document.createElement('div');
		fallback.innerHTML =
			'<!--exact:dynamic:test-root--><!--exact:suspense-fallback:0--><i>loading</i><!--/exact:suspense-fallback:0--><!--/exact:dynamic:test-root-->';
		const indicator = fallback.querySelector('i');
		expect(
			adoptStatic(
				createOperation(
					Suspense,
					{ fallback: createOperation('i', null, 'loading') },
					createOperation(Pending, {})
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
		const container = document.createElement('div');
		const vnode = createTestComponentReceipt(KeyedAdoptionList, {});
		container.innerHTML = `<!--exact:dynamic:list--><!--exact:dynamic:tasks--><!--i:a--><li>A</li><!--/i:a--><!--i:b--><li>B</li><!--/i:b--><!--/exact:dynamic:tasks--><!--/exact:dynamic:list-->`;
		const originalB = container.querySelectorAll('li')[1];

		expect(adoptMarkerlessComponentRoot(vnode, container)).toBe(true);
		const list = keyedAdoptionListInstance();
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

		render(createOperation('main', null, createServerSlot('shell:children')), container);

		expect(container.querySelector('[data-exact-server-slot="shell:children"]')).toBe(slot);
		expect(container.querySelector('strong')).toBe(child);
		expect(container.textContent).toBe('Server child');
		expect(unmount(container)).toBe(true);
	});

	it('adopts dynamic and unsafe HTML ranges with their ownership policies', () => {
		const dynamicContainer = document.createElement('div');
		dynamicContainer.innerHTML =
			'<!--exact:dynamic:test-root--><!--exact:dynamic:value-->current<!--/exact:dynamic:value--><!--/exact:dynamic:test-root-->';
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
			'<!--exact:dynamic:test-root--><!--exact:unsafe-html:value--><strong>trusted</strong><!--/exact:unsafe-html:value--><!--/exact:dynamic:test-root-->';
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

	it('rejects missing, incomplete, and mismatched compiled component boundaries', () => {
		const operation = createTestComponentReceipt(HydratedGreeting, {});
		const marker = `exact:component:0:${encodeExactMarkerPart(exactComponentIdentity(HydratedGreeting))}`;
		const missing = document.createElement('div');
		missing.innerHTML = '<span>server</span>';
		expect(adoptComponentRoot(operation, missing)).toBe(false);

		const incomplete = document.createElement('div');
		incomplete.innerHTML = `<!--${marker}--><span>server</span>`;
		expect(adoptComponentRoot(operation, incomplete)).toBe(false);

		const mismatch = document.createElement('div');
		mismatch.innerHTML =
			'<!--exact:component:0:wrong--><span>server</span><!--/exact:component:0:wrong-->';
		expect(adoptComponentRoot(operation, mismatch)).toBe(false);
	});

	it('adopts a complete HTML document without replacing its host nodes', () => {
		const documentNode = document.implementation.createHTMLDocument('Fixture');
		documentNode.body.innerHTML = '<main>server</main>';
		const html = documentNode.documentElement;
		const vnode = createTestComponentReceipt(DocumentAdoptionRoot, {});

		expect(adoptDocumentRoot(vnode, documentNode)).toBe(true);
		expect(documentNode.documentElement).toBe(html);
		expect(adoptDocumentRoot(vnode, documentNode)).toBe(false);
		expect(unmount(html)).toBe(true);
	});
});
