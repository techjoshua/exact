/** @vitest-environment jsdom */
import { Fragment, createVNode, type Component } from '@exactjs/core';
import {
	createCompiledRenderProgram as createCoreRenderProgram,
	createCompiledVNode,
	createExpression,
	createPreparedRenderProgram,
	prepareCompiledRenderProgram as prepareCoreRenderProgram
} from '@exactjs/core/runtime/render';
import { collectionRef, flushSync, indexedReactive, reactive, ref } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import { render, unmount } from './index.js';
import { jsx } from './test-support/native-vnode.js';
import { withGenericRenderProgramBindings } from './testing.js';

const createCompiledRenderProgram: typeof createCoreRenderProgram = (
	cacheKey,
	createProgram,
	readers,
	fallback
) =>
	createCoreRenderProgram(
		cacheKey,
		() => withGenericRenderProgramBindings(createProgram()),
		readers,
		fallback
	);
const prepareCompiledRenderProgram: typeof prepareCoreRenderProgram = (program) =>
	prepareCoreRenderProgram(withGenericRenderProgramBindings(program));

it('observes in-place collection mutations through a compiler-owned list lane', () => {
	const state = reactive({ items: [{ id: 'a' }] });
	const source = ref(state.items)!;
	const cache = new Map();
	const vnode = createCompiledRenderProgram(
		'render-program:list-slot',
		() => ({
			version: 3,
			id: 'render-program:list-slot',
			namespace: 'html',
			template:
				'<ul data-exact-id="list-root"><!--exact:dynamic:items--><!--/exact:dynamic:items--></ul>',
			slots: [['child', 'items']],
			bindings: [['lists', [0]]],
			nodes: [['list-root', 'ul']]
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

it('observes an indexed-state collection without a parent-path source', () => {
	const state = indexedReactive<{ items: Array<{ id: string }> }>(['items']);
	state.items = [{ id: 'a' }, { id: 'b' }];
	const cache = new Map();
	const source = collectionRef(state.items)!;
	const vnode = createCompiledRenderProgram(
		'render-program:indexed-list-slot',
		() => ({
			version: 3,
			id: 'render-program:indexed-list-slot',
			namespace: 'html',
			template: '<ul><!--exact:dynamic:items--><!--/exact:dynamic:items--></ul>',
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
	state.items.splice(0, 2, state.items[1]!, state.items[0]!);
	flushSync();
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
			version: 3,
			id: 'render-program:component-slot',
			namespace: 'html',
			template:
				'<main data-exact-id="component-root"><!--exact:dynamic:counter--><!--/exact:dynamic:counter--></main>',
			slots: [['component', 'counter']],
			bindings: [['component', 0]],
			nodes: [['component-root', 'main']]
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
		version: 3,
		id: 'render-program:property-writer',
		namespace: 'html',
		template: '<button data-exact-id="writer"></button>',
		slots: [
			['property', 0, 'title'],
			['property', 0, 'onClick']
		],
		bindings: [['properties', [0, 1]]],
		nodes: [['writer', 'button']]
	});
	const vnode = createPreparedRenderProgram(
		program,
		[() => undefined, () => undefined],
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
