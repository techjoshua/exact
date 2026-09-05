/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/lists';
import '@exactjs/core/runtime/refs';
import './runtime/root-release.js';
import {
	activateTaskForHost,
	createRef,
	defineTask,
	type Component,
	type RootBinding,
	type RootLifecycle,
	type TaskContext
} from '@exactjs/core';
import { createCompiledOperation, createOperation, jsx } from './test-support/native-operations.js';
import { flushSync, watch } from '@exactjs/reactive';
import { runTaskFrame } from '@exactjs/core/framework/task-frames';
import { describe, expect, it, vi } from 'vitest';
import { renderTestTree as render } from './testing.js';
import {
	ChangingRefButton,
	ConnectedMountParent,
	DebugParent,
	LifecycleCounter,
	RootControl,
	changingRefButtonInstance,
	connectedMountOrder,
	connectedMountSawPlacedRef,
	counterSetups,
	firstButtonRef,
	lifecycleCounterInstance,
	resetRootLifecycleFixtures,
	rootControlInstance,
	rootControlLifecycle,
	secondButtonRef
} from './test-support/roots/root-lifecycle.fixtures.js';
import {
	RemovalRetentionOwner,
	ReplacementRetentionOwner,
	ReversibleRetentionOwner,
	finishRemovalRetention,
	finishReplacementRetention,
	removalRetentionOwnerInstance,
	removalRetentionRoot,
	replacementRetentionOwnerInstance,
	resetRemovalRetentionFixture,
	resetReplacementRetentionFixture,
	resetReversibleRetentionFixture,
	reversibleActivations,
	reversibleDeactivations,
	reversibleRetentionOwnerInstance,
	reversibleRetentionRoot
} from './test-support/roots/root-retention.fixtures.js';

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

		render(createOperation('p', null, 'profiled'), container, { onProfile });

		expect(container.textContent).toBe('profiled');
		expect(onProfile).toHaveBeenCalledWith(
			expect.objectContaining({
				subsystem: 'dom',
				phase: 'render',
				elapsedMs: expect.any(Number)
			})
		);
	});

	it('does not let a profiling callback replace a successful render', () => {
		const container = document.createElement('div');
		expect(() =>
			render(createOperation('p', null, 'committed'), container, {
				onProfile() {
					throw new Error('profiler failed');
				}
			})
		).not.toThrow();
		expect(container.textContent).toBe('committed');
	});

	it('mounts and updates a component', () => {
		resetRootLifecycleFixtures();
		const container = document.createElement('div');
		render(jsx(LifecycleCounter, {}), container);
		const instance = lifecycleCounterInstance();

		expect(container.textContent).toBe('0');
		instance.state.count = 2;
		flushSync();
		expect(container.textContent).toBe('2');
		expect(counterSetups).toBe(1);
	});

	it('runs nested mount handlers after final placement in child-before-parent order', () => {
		resetRootLifecycleFixtures();
		const container = document.createElement('div');

		render(jsx(ConnectedMountParent, {}), container);

		expect(connectedMountSawPlacedRef).toBe(true);
		expect(connectedMountOrder).toEqual(['child', 'parent']);
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
		render(createCompiledOperation(Parent, {}), container);

		expect(commentData(container)).toEqual([]);
		expect(container.textContent).toBe('child');
	});

	it('can expose named boundary comments for renderer debugging', () => {
		const container = document.createElement('div');
		render(createCompiledOperation(DebugParent, {}), container, { debugMarkers: true });

		expect(commentData(container)).toEqual(
			expect.arrayContaining(['exact-component', 'exact-dynamic'])
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
		const container = document.createElement('div');
		render(jsx(RootControl, {}), container);
		const instance = rootControlInstance();
		const root = rootControlLifecycle();

		expect(root.current).toBe(container.querySelector('button'));
		expect(root.generation).toBe(1);
		expect(root.introduction).toBe('initial');
		expect(root.presented).toBe(true);

		instance.state.link = true;
		flushSync();

		expect(root.current).toBe(container.querySelector('a'));
		expect(root.generation).toBe(2);
		expect(root.introduction).toBe('update');
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
		resetRemovalRetentionFixture();
		const container = document.createElement('div');
		render(jsx(RemovalRetentionOwner, {}), container);
		const owner = removalRetentionOwnerInstance();
		const childRoot = removalRetentionRoot();
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

		finishRemovalRetention();
		await vi.waitFor(() => expect(container.querySelector('button')).toBeNull());
	});

	it('retains a type-replaced range across child-plan cleanup', async () => {
		resetReplacementRetentionFixture();
		const container = document.createElement('div');
		render(jsx(ReplacementRetentionOwner, {}), container);
		const owner = replacementRetentionOwnerInstance();
		const button = container.querySelector('button');

		owner.state.replace = true;
		flushSync();

		expect(container.querySelector('button')).toBe(button);
		expect(container.querySelector('span')?.textContent).toBe('Replacement');
		finishReplacementRetention();
		await vi.waitFor(() => expect(container.querySelector('button')).toBeNull());
	});

	it('reverses an exact retained root generation without replacing its DOM', () => {
		resetReversibleRetentionFixture();
		const container = document.createElement('div');
		render(jsx(ReversibleRetentionOwner, {}), container);
		const owner = reversibleRetentionOwnerInstance();
		const childRoot = reversibleRetentionRoot();
		const button = container.querySelector('button');
		expect(reversibleActivations).toBe(1);

		owner.state.show = false;
		flushSync();
		expect(childRoot.release).toBeDefined();
		expect(reversibleDeactivations).toBe(1);

		owner.state.show = true;
		flushSync();

		expect(container.querySelector('button')).toBe(button);
		expect(childRoot.current).toBe(button);
		expect(childRoot.generation).toBe(1);
		expect(childRoot.introduction).toBe('initial');
		expect(childRoot.release).toBeUndefined();
		expect(reversibleActivations).toBe(2);
	});

	it('publishes release before stopping a removed keyed-list child', async () => {
		let owner!: Component<{ items: Array<{ id: string }> }>;
		let childRoot!: RootLifecycle<Element>;
		let finish!: () => void;
		const settlement = new Promise<void>((resolve) => {
			finish = resolve;
		});

		function Child(this: Component<{}>) {
			const root = (childRoot = this.refs.root<Element>());
			watch(() => {
				if (!root.release) return;
				void runTaskFrame(
					{ kind: 'test-keyed-release', readiness: 'nonblocking' },
					{ work: () => settlement }
				).catch(() => undefined);
			});
			return () => jsx('li', { children: 'Retained keyed child' });
		}

		function List(this: Component<{ items: Array<{ id: string }> }>) {
			owner = this;
			this.state.items = [{ id: 'a' }];
			return () =>
				jsx('ul', {
					children: this.map(
						this.state.items,
						(item) => item.id,
						() => jsx(Child, {})
					)
				});
		}

		const container = document.createElement('div');
		render(jsx(List, {}), container);
		const item = container.querySelector('li');
		expect(childRoot.current).toBe(item);

		owner.state.items.splice(0, 1);
		flushSync();
		expect(container.querySelector('li')).toBe(item);

		finish();
		await vi.waitFor(() => expect(container.querySelector('li')).toBeNull());
	});

	it('clears the previous ref when a DOM node receives a new ref', () => {
		const container = document.createElement('div');
		render(jsx(ChangingRefButton, {}), container);
		const instance = changingRefButtonInstance();
		const button = container.querySelector('button');
		expect(instance.refs.get(firstButtonRef)).toBe(button);

		instance.state.useFirst = false;
		flushSync();

		expect(instance.refs.get(firstButtonRef)).toBeUndefined();
		expect(instance.refs.get(secondButtonRef)).toBe(button);
	});
});
