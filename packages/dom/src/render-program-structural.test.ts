/** @vitest-environment jsdom */
import { Fragment, createVNode, type Component } from '@exactjs/core';
import {
	createCompiledVNode,
	createExpression,
	createFrameworkFixtureComponentInstance,
	keyCompiledVNode,
	createPreparedRenderProgram,
	prepareCompiledRenderProgram as prepareCoreRenderProgram
} from '@exactjs/core/runtime/render';
import { collectionRef, flushSync, indexedReactive, reactive, ref } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import { render, unmount } from './index.js';
import {
	beginCompiledProgramClaims,
	bindCompiledProgramKeyedChild,
	claimCompiledProgramKeyedChild
} from './runtime/render-program.js';
import { jsx } from './test-support/native-vnode.js';
import { withGenericRenderProgramBindings } from './testing.js';

function RenderProgramOwner(this: Component<{}>) {
	return () => null;
}
const renderProgramOwner = createFrameworkFixtureComponentInstance(RenderProgramOwner, {});

const createCompiledRenderProgram = (
	_cacheKey: string,
	createProgram: () => Parameters<typeof prepareCoreRenderProgram>[0],
	readers: Parameters<typeof createPreparedRenderProgram>[1],
	_fallback?: () => unknown
) =>
	createPreparedRenderProgram(
		prepareCoreRenderProgram(withGenericRenderProgramBindings(createProgram())),
		readers,
		renderProgramOwner
	);
const prepareCompiledRenderProgram: typeof prepareCoreRenderProgram = (program) =>
	prepareCoreRenderProgram(withGenericRenderProgramBindings(program));

it('reconciles compiler-keyed program children without list or item marker ranges', () => {
	const state = reactive({ items: [{ id: 'a' }, { id: 'b' }] });
	const vnode = createCompiledRenderProgram(
		'render-program:direct-keyed-array',
		() => ({
			version: 4,
			id: 'render-program:direct-keyed-array',
			namespace: 'html',
			template: '<ul><!--exact:dynamic:items--><!--/exact:dynamic:items--></ul>',
			slots: [['child', 'items']],
			bindings: [['lists', [0]]],
			nodes: [[0, 'ul']]
		}),
		[() => state.items.map((item) => keyCompiledVNode(createVNode('li', {}, item.id), item.id))]
	);
	const container = document.createElement('div');
	render(vnode, container);
	const original = [...container.querySelectorAll('li')];
	const comments = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
	let commentCount = 0;
	while (comments.nextNode()) commentCount++;
	expect(commentCount).toBe(2);

	state.items.splice(0, 2, state.items[1]!, state.items[0]!);
	flushSync();
	const reordered = [...container.querySelectorAll('li')];
	expect(reordered.map((node) => node.textContent)).toEqual(['b', 'a']);
	expect(reordered[0]).toBe(original[1]);
	expect(reordered[1]).toBe(original[0]);
});

it('owns a final compiler-keyed child lane without structural marker nodes', () => {
	const state = reactive({ items: [{ id: 'a' }, { id: 'b' }] });
	const program = prepareCoreRenderProgram({
		version: 4,
		id: 'render-program:markerless-keyed-tail',
		namespace: 'html',
		template: '<ul></ul>',
		directClaims: true,
		keyedChildren: 1,
		bind(target) {
			if (beginCompiledProgramClaims(target, 'ul', 'html', 1, 1)) {
				claimCompiledProgramKeyedChild(target, 0, 0);
				return;
			}
			bindCompiledProgramKeyedChild(target, 0);
		}
	});
	const vnode = createPreparedRenderProgram(
		program,
		[() => state.items.map((item) => keyCompiledVNode(createVNode('li', {}, item.id), item.id))],
		renderProgramOwner
	);
	const container = document.createElement('div');
	render(vnode, container);
	const original = [...container.querySelectorAll('li')];
	expect(container.querySelector('ul')?.childNodes).toHaveLength(2);

	state.items.splice(0, 2, state.items[1]!, state.items[0]!);
	flushSync();
	const reordered = [...container.querySelectorAll('li')];
	expect(reordered.map((node) => node.textContent)).toEqual(['b', 'a']);
	expect(reordered[0]).toBe(original[1]);
	expect(reordered[1]).toBe(original[0]);
});

it('observes in-place collection mutations through a compiler-owned list lane', () => {
	const state = reactive({ items: [{ id: 'a' }] });
	const source = ref(state.items)!;
	const cache = new Map();
	const vnode = createCompiledRenderProgram(
		'render-program:list-slot',
		() => ({
			version: 4,
			id: 'render-program:list-slot',
			namespace: 'html',
			template:
				'<ul data-exact-id="list-root"><!--exact:dynamic:items--><!--/exact:dynamic:items--></ul>',
			slots: [['child', 'items']],
			bindings: [['lists', [0]]],
			nodes: [[0, 'ul']]
		}),
		[
			() =>
				createVNode(Fragment, {
					list: {
						collection: state.items,
						source,
						key: (item: { id: string }) => item.id,
						render: (item: { id: string }) => createCompiledVNode('li', {}, item.id),
						cache
					}
				})
		]
	);
	const container = document.createElement('div');
	render(vnode, container);
	expect(container.querySelectorAll('li')).toHaveLength(1);
	state.items.push({ id: 'b' });
	flushSync();
	expect(container.querySelectorAll('li')).toHaveLength(2);
});

it('observes an indexed-state collection through its stable structural source', () => {
	const state = indexedReactive<{ items: Array<{ id: string }> }>(['items']);
	state.items = [{ id: 'a' }, { id: 'b' }];
	const cache = new Map();
	const source = collectionRef(state.items)!;
	const read = vi.fn(() =>
		createVNode(Fragment, {
			list: {
				collection: state.items,
				source,
				key: (item: { id: string }) => item.id,
				render: (item: { id: string }) => createCompiledVNode('li', {}, item.id),
				cache
			}
		})
	);
	const vnode = createCompiledRenderProgram(
		'render-program:indexed-list-slot',
		() => ({
			version: 4,
			id: 'render-program:indexed-list-slot',
			namespace: 'html',
			template: '<ul><!--exact:dynamic:items--><!--/exact:dynamic:items--></ul>',
			slots: [['child', 'items']],
			bindings: [['lists', [0]]],
			nodes: [[0, 'ul']]
		}),
		[read]
	);
	const container = document.createElement('div');
	render(vnode, container);
	state.items.splice(0, 2, state.items[1]!, state.items[0]!);
	flushSync();
	expect(read).toHaveBeenCalledTimes(2);
	expect([...container.querySelectorAll('li')].map((node) => node.textContent)).toEqual(['b', 'a']);
});

it('owns a stateful native component lifecycle in an explicit component slot', () => {
	const released = vi.fn();
	function Counter(this: Component<{ count: number }>) {
		this.state.count = 0;
		this.onUnmount(released);
		return () =>
			createCompiledVNode(
				'button',
				{ onClick: () => this.state.count++ },
				createExpression(() => this.state.count)
			);
	}
	const vnode = createCompiledRenderProgram(
		'render-program:component-slot',
		() => ({
			version: 4,
			id: 'render-program:component-slot',
			namespace: 'html',
			template:
				'<main data-exact-id="component-root"><!--exact:dynamic:counter--><!--/exact:dynamic:counter--></main>',
			slots: [['component', 'counter']],
			bindings: [['component', 0]],
			nodes: [[0, 'main']]
		}),
		[() => jsx(Counter, {})]
	);
	const container = document.createElement('div');
	render(vnode, container);
	const host = container.firstElementChild;
	const button = container.querySelector('button')!;
	expect(button.textContent).toBe('0');
	button.click();
	flushSync();
	expect(button.textContent).toBe('1');
	expect(container.firstElementChild).toBe(host);
	unmount(container);
	expect(released).toHaveBeenCalledOnce();
});

it('tracks and applies one compiler-owned property writer operation', () => {
	const state = reactive({ count: 0 });
	const program = prepareCompiledRenderProgram({
		version: 4,
		id: 'render-program:property-writer',
		namespace: 'html',
		template: '<button data-exact-id="writer"></button>',
		slots: [
			['property', 0, 'title'],
			['property', 0, 'onClick']
		],
		bindings: [['properties', [0, 1]]],
		nodes: [[0, 'button']]
	});
	const vnode = createPreparedRenderProgram(
		program,
		[() => undefined, () => undefined],
		renderProgramOwner,
		undefined,
		(_group, apply) => {
			apply('title', String(state.count));
			apply('onClick', () => state.count++);
		}
	);
	const container = document.createElement('div');
	render(vnode, container);
	const button = container.querySelector('button')!;
	expect(button.title).toBe('0');
	button.click();
	flushSync();
	expect(button.title).toBe('1');
});
