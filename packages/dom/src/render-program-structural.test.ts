/** @vitest-environment jsdom */
import { createFrameworkFixtureComponentInstance } from '@exactjs/core/testing';
import { type Component } from '@exactjs/core';
import {
	createExpression,
	createPreparedRenderProgram,
	prepareCompiledRenderProgram as prepareCoreRenderProgram
} from '@exactjs/core/runtime/render';
import { createCompiledKeyedChildReceipt as keyCompiledVNode } from '@exactjs/core/runtime/component-operations';
import { flushSync, reactive } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import { unmount } from './index.js';
import { legacyTestRenderProgram, renderTestTree as render } from './testing.js';
import {
	applyCompiledProgramChild,
	beginCompiledProgramClaims,
	bindCompiledProgramChild,
	bindCompiledProgramKeyedChild,
	claimCompiledProgramChild,
	claimCompiledProgramKeyedChild
} from './runtime/render-program.js';
import {
	createCompiledOperation,
	createOperation,
	createTestComponentReceipt
} from './test-support/native-operations.js';
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
it('applies a compiler-owned structural child operation without a retained watcher', () => {
	const state = reactive({ shown: true });
	let target: Parameters<typeof bindCompiledProgramChild>[0] | undefined;
	const program = prepareCoreRenderProgram(
		legacyTestRenderProgram({
			version: 7,
			id: 'render-program:direct-child-update',
			namespace: 'html',
			template: '<section><!--x:child--><!--/x:child--><footer>After</footer></section>',
			directClaims: true,
			bind(nextTarget) {
				target = nextTarget;
				if (beginCompiledProgramClaims(nextTarget, 'section', 'html', 2, 1)) {
					claimCompiledProgramChild(nextTarget, 0, 0, 'child');
					return;
				}
				bindCompiledProgramChild(nextTarget, 0, true);
			}
		})
	);
	const vnode = createPreparedRenderProgram(
		program,
		[() => (state.shown ? createCompiledOperation('strong', {}, 'Shown') : null)],
		renderProgramOwner
	);
	const container = document.createElement('div');
	render(vnode, container);
	expect(container.textContent).toBe('ShownAfter');
	state.shown = false;
	flushSync();
	expect(container.textContent).toBe('ShownAfter');
	applyCompiledProgramChild(target!, 0);
	expect(container.textContent).toBe('After');
});

it('reconciles compiler-keyed program children without list or item marker ranges', () => {
	const state = reactive({ items: [{ id: 'a' }, { id: 'b' }] });
	const vnode = createCompiledRenderProgram(
		'render-program:direct-keyed-array',
		() => ({
			version: 7,
			id: 'render-program:direct-keyed-array',
			namespace: 'html',
			template: '<ul><!--x:items--><!--/x:items--></ul>',
			slots: [['child', 'items']],
			bindings: [['lists', [0]]],
			nodes: [[0, 'ul']]
		}),
		[() => state.items.map((item) => keyCompiledVNode(createOperation('li', {}, item.id), item.id))]
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
	const program = prepareCoreRenderProgram(
		legacyTestRenderProgram({
			version: 7,
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
		})
	);
	const vnode = createPreparedRenderProgram(
		program,
		[
			() => state.items.map((item) => keyCompiledVNode(createOperation('li', {}, item.id), item.id))
		],
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

it('owns a stateful native component lifecycle in an explicit component slot', () => {
	const released = vi.fn();
	function Counter(this: Component<{ count: number }>) {
		this.state.count = 0;
		this.onUnmount(released);
		return () =>
			createCompiledOperation(
				'button',
				{ onClick: () => this.state.count++ },
				createExpression(() => this.state.count)
			);
	}
	const vnode = createCompiledRenderProgram(
		'render-program:component-slot',
		() => ({
			version: 7,
			id: 'render-program:component-slot',
			namespace: 'html',
			template: '<main data-exact-id="component-root"><!--x:counter--><!--/x:counter--></main>',
			slots: [['component', 'counter']],
			bindings: [['component', 0]],
			nodes: [[0, 'main']]
		}),
		[() => createTestComponentReceipt(Counter, {})]
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
