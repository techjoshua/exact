/** @vitest-environment jsdom */
import { Fragment, createVNode, type Component } from '@exactjs/core';
import {
	createCompiledRenderProgram,
	createCompiledVNode,
	createExpression,
	createPreparedRenderProgram,
	prepareCompiledRenderProgram
} from '@exactjs/core/runtime/render';
import { flushSync, reactive, ref } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import { render, unmount } from './index.js';
import { jsx } from './test-support/native-vnode.js';

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
			parts: [],
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
			parts: [],
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
	expect(button.hasAttribute('data-exact-id')).toBe(false);
	expect(button.title).toBe('0');
	button.click();
	flushSync();
	expect(button.title).toBe('1');
});
