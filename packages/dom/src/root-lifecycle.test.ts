/**
 * @vitest-environment jsdom
 */
import {
	activateTaskForHost,
	createCompiledVNode,
	createRef,
	createVNode,
	defineTask,
	type Component,
	type TaskContext
} from '@exactjs/core';
import { jsx } from '@exactjs/jsx';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { render } from './index.js';

function commentData(root: Node): string[] {
	const comments: string[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
	let current = walker.nextNode();
	while (current) {
		comments.push((current as Comment).data);
		current = walker.nextNode();
	}
	return comments;
}

describe('@exactjs/dom root-lifecycle', () => {
	it('reports opt-in render timings without changing renderer behavior', () => {
		const container = document.createElement('div');
		const onProfile = vi.fn();

		render(createVNode('p', null, 'profiled'), container, { onProfile });

		expect(container.textContent).toBe('profiled');
		expect(onProfile).toHaveBeenCalledWith(
			expect.objectContaining({
				subsystem: 'dom',
				phase: 'render',
				elapsedMs: expect.any(Number)
			})
		);
	});

	it('mounts and updates a component', () => {
		let instance!: Component<{ count: number }>;
		const rendered = vi.fn();

		function Counter(this: Component<{ count: number }>) {
			instance = this;
			this.state.count = 0;
			return () => {
				rendered();
				return jsx('button', { children: this.state.count });
			};
		}

		const container = document.createElement('div');
		render(jsx(Counter, {}), container);

		expect(container.textContent).toBe('0');
		instance.state.count = 2;
		flushSync();
		expect(container.textContent).toBe('2');
		expect(rendered).toHaveBeenCalledTimes(2);
	});

	it('settles synchronous setup activations before mounting required child props', () => {
		function Selection(this: Component<{ cells: string[]; selectedIndex: number }>) {
			this.state.cells = ['ready'];
			activateTaskForHost(
				this,
				defineTask({}, (cells: string[], _task: TaskContext) => {
					this.state.selectedIndex = cells.length - 1;
				}),
				this.reactive(() => this.state.cells)
			);

			return () => jsx(SelectedCell, { value: this.state.cells[this.state.selectedIndex]! });
		}

		function SelectedCell(this: Component<{}>, props: { value: string }) {
			return () => jsx('output', { children: props.value.toUpperCase() });
		}

		const container = document.createElement('div');
		render(jsx(Selection, {}), container);

		expect(container.textContent).toBe('READY');
	});

	it('uses quiet runtime anchors by default', () => {
		function Child() {
			return () => jsx('span', { children: 'child' });
		}

		function Parent() {
			return () => jsx('main', { children: jsx(Child, {}) });
		}

		const container = document.createElement('div');
		render(createCompiledVNode(Parent, {}), container);

		expect(commentData(container)).toEqual([]);
		expect(container.textContent).toBe('child');
	});

	it('can expose named boundary comments for renderer debugging', () => {
		function Child() {
			return () => jsx('span', { children: 'child' });
		}

		function Parent() {
			return () => jsx('main', { children: jsx(Child, {}) });
		}

		const container = document.createElement('div');
		render(createCompiledVNode(Parent, {}), container, { debugMarkers: true });

		expect(commentData(container)).toEqual(
			expect.arrayContaining(['exact-component', 'exact-cell'])
		);
		expect(container.textContent).toBe('child');
	});

	it('fulfills refs', () => {
		const buttonRef = createRef<HTMLButtonElement>('button');
		let instance!: Component<{}>;

		function Button(this: Component<{}>) {
			instance = this;
			return () => jsx('button', { ref: this.ref(buttonRef), children: 'Save' });
		}

		const container = document.createElement('div');
		render(jsx(Button, {}), container);

		expect(instance.refs.get(buttonRef)).toBe(container.querySelector('button'));
	});

	it('clears the previous ref when a DOM node receives a new ref', () => {
		const firstRef = createRef<HTMLButtonElement>('first');
		const secondRef = createRef<HTMLButtonElement>('second');
		let instance!: Component<{ useFirst: boolean }>;

		function Button(this: Component<{ useFirst: boolean }>) {
			instance = this;
			this.state.useFirst = true;

			return () =>
				jsx('button', {
					ref: this.state.useFirst == true ? this.ref(firstRef) : this.ref(secondRef),
					children: 'Save'
				});
		}

		const container = document.createElement('div');
		render(jsx(Button, {}), container);
		const button = container.querySelector('button');
		expect(instance.refs.get(firstRef)).toBe(button);

		instance.state.useFirst = false;
		flushSync();

		expect(instance.refs.get(firstRef)).toBeUndefined();
		expect(instance.refs.get(secondRef)).toBe(button);
	});
});
