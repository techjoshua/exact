/**
 * @vitest-environment jsdom
 */
import {
	activateTaskForHost,
	createRef,
	defineTask,
	type Component,
	type RootBinding,
	type RootLifecycle,
	type TaskContext
} from '@exactjs/core';
import { createCompiledVNode, createVNode, jsx } from './test-support/native-vnode.js';
import { flushSync, watch } from '@exactjs/reactive';
import { runTaskFrame } from '@exactjs/core/framework/task-frames';
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

	it('publishes the first intrinsic component root and advances its generation on replacement', () => {
		let instance!: Component<{ link: boolean }>;
		let root!: RootLifecycle<Element>;

		function Control(this: Component<{ link: boolean }>) {
			instance = this;
			this.state.link = false;
			root = this.refs.root();
			return () =>
				this.state.link
					? jsx('a', { href: '#next', children: 'Next' })
					: jsx('button', { children: 'Next' });
		}

		const container = document.createElement('div');
		render(jsx(Control, {}), container);

		expect(root.current).toBe(container.querySelector('button'));
		expect(root.generation).toBe(1);
		expect(root.presented).toBe(true);

		instance.state.link = true;
		flushSync();

		expect(root.current).toBe(container.querySelector('a'));
		expect(root.generation).toBe(2);
	});

	it('lets an element ref explicitly select a component root', () => {
		const actionRef = createRef<HTMLButtonElement>('action');
		let root!: RootBinding<HTMLButtonElement>;

		function Card(this: Component<{}>) {
			root = this.refs.root(this.ref(actionRef));
			return () =>
				jsx('section', {
					children: jsx('button', { ref: this.ref(actionRef), children: 'Save' })
				});
		}

		const container = document.createElement('div');
		render(jsx(Card, {}), container);

		expect(root.current).toBe(container.querySelector('button'));
		expect(root.current).not.toBe(container.querySelector('section'));
	});

	it('retains a released root until structurally attached work settles', async () => {
		let owner!: Component<{ show: boolean }>;
		let childRoot!: RootLifecycle<Element>;
		let finish!: () => void;
		const settlement = new Promise<void>((resolve) => {
			finish = resolve;
		});

		function Child(this: Component<{}>) {
			childRoot = this.refs.root();
			watch(() => {
				const release = childRoot.release;
				if (!release) return;
				void runTaskFrame(
					{ kind: 'test-release', readiness: 'nonblocking' },
					{ work: () => settlement }
				).catch(() => undefined);
			});
			return () => jsx('button', { children: 'Retained' });
		}

		function Owner(this: Component<{ show: boolean }>) {
			owner = this;
			this.state.show = true;
			return () => (this.state.show ? jsx(Child, {}) : null);
		}

		const container = document.createElement('div');
		render(jsx(Owner, {}), container);
		const button = container.querySelector('button');

		owner.state.show = false;
		flushSync();

		expect(container.querySelector('button')).toBe(button);
		expect(childRoot.current).toBeUndefined();
		expect(childRoot.release).toMatchObject({
			target: button,
			generation: 1,
			reason: 'reconcile-removed',
			presented: true
		});

		finish();
		await vi.waitFor(() => expect(container.querySelector('button')).toBeNull());
	});

	it('reverses an exact retained root generation without replacing its DOM', () => {
		let owner!: Component<{ show: boolean }>;
		let childRoot!: RootLifecycle<Element>;

		function Child(this: Component<{}>) {
			childRoot = this.refs.root();
			watch(() => {
				if (!childRoot.release) return;
				void runTaskFrame(
					{ kind: 'test-release', readiness: 'nonblocking' },
					{ work: () => new Promise<void>(() => undefined) }
				).catch(() => undefined);
			});
			return () => jsx('button', { children: 'Reversible' });
		}

		function Owner(this: Component<{ show: boolean }>) {
			owner = this;
			this.state.show = true;
			return () => (this.state.show ? jsx(Child, {}) : null);
		}

		const container = document.createElement('div');
		render(jsx(Owner, {}), container);
		const button = container.querySelector('button');

		owner.state.show = false;
		flushSync();
		expect(childRoot.release).toBeDefined();

		owner.state.show = true;
		flushSync();

		expect(container.querySelector('button')).toBe(button);
		expect(childRoot.current).toBe(button);
		expect(childRoot.generation).toBe(1);
		expect(childRoot.release).toBeUndefined();
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
