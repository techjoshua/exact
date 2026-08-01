/**
 * @vitest-environment jsdom
 */
import {
	Activity,
	Suspense,
	activateTaskForHost,
	createExpression,
	createRef,
	defineTask,
	stageTaskMutation,
	taskAwait,
	type ActivityMode,
	type Component
} from '@exactjs/core';
import { createCompiledVNode, jsx } from './test-support/native-vnode.js';
import { flushSync, runWithPriority } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { render, unmount } from './index.js';
import { inspectDomRoot, type DomInspectionNode } from './testing.js';

function findActivity(node: DomInspectionNode): DomInspectionNode | undefined {
	if (node.activity) return node;
	for (const child of node.children) {
		const match = findActivity(child);
		if (match) return match;
	}
	return undefined;
}

describe('@exactjs/dom native Activity', () => {
	it('parks a subtree without disposing it and publishes accumulated work before activation', () => {
		const buttonRef = createRef<HTMLButtonElement>('counter');
		let boundary!: Component<{ mode: ActivityMode }>;
		let counter!: Component<{ count: number }>;

		function Counter(this: Component<{ count: number }>) {
			counter = this;
			this.state.count = 0;
			return () =>
				createCompiledVNode(
					'button',
					{ ref: this.ref(buttonRef) },
					createExpression(() => this.state.count)
				);
		}

		function Boundary(this: Component<{ mode: ActivityMode }>) {
			boundary = this;
			this.state.mode = 'active';
			return () =>
				createCompiledVNode(
					Activity,
					{ mode: createExpression(() => this.state.mode) },
					createCompiledVNode(Counter, {})
				);
		}

		const container = document.createElement('div');
		render(jsx(Boundary, {}), container);
		const button = container.querySelector('button')!;

		boundary.state.mode = 'parked';
		flushSync();
		expect(container.querySelector('button')).toBeNull();
		expect(counter.refs.get(buttonRef)).toBe(button);
		const inspected = inspectDomRoot(container);
		const activityNode = inspected ? findActivity(inspected) : undefined;
		expect(activityNode?.activity).toMatchObject({
			mode: 'parked',
			detached: true
		});

		counter.state.count = 2;
		flushSync();
		expect(button.textContent).toBe('0');

		boundary.state.mode = 'active';
		flushSync();
		expect(container.querySelector('button')).toBe(button);
		expect(button.textContent).toBe('2');

		unmount(container);
		expect(counter.refs.get(buttonRef)).toBeUndefined();
	});

	it('prepares background work at deferred priority while remaining detached', () => {
		let boundary!: Component<{ mode: ActivityMode }>;
		let panel!: Component<{ label: string }>;

		function Panel(this: Component<{ label: string }>) {
			panel = this;
			this.state.label = 'before';
			return () =>
				createCompiledVNode(
					'p',
					{},
					createExpression(() => this.state.label)
				);
		}

		function Boundary(this: Component<{ mode: ActivityMode }>) {
			boundary = this;
			this.state.mode = 'background';
			return () =>
				createCompiledVNode(
					Activity,
					{ mode: createExpression(() => this.state.mode) },
					createCompiledVNode(Panel, {})
				);
		}

		const container = document.createElement('div');
		render(jsx(Boundary, {}), container);
		expect(container.querySelector('p')).toBeNull();

		runWithPriority('interactive', () => {
			panel.state.label = 'prepared';
		});
		flushSync('normal');
		boundary.state.mode = 'active';
		flushSync();

		expect(container.querySelector('p')?.textContent).toBe('prepared');
		unmount(container);
	});

	it('keeps parked readiness private and joins the visible boundary when activated', async () => {
		let boundary!: Component<{ mode: ActivityMode }>;
		let resolve!: () => void;
		const pending = new Promise<void>((settle) => {
			resolve = settle;
		});
		function Panel(this: Component<{ label: string }>) {
			this.state.label = 'waiting';
			activateTaskForHost(
				this,
				defineTask({ readiness: 'blocking' }, async ({ signal }) => {
					await taskAwait(signal, pending);
					stageTaskMutation(signal, () => {
						this.state.label = 'ready';
					});
				})
			);
			return () =>
				createCompiledVNode(
					'p',
					{},
					createExpression(() => this.state.label)
				);
		}
		function Boundary(this: Component<{ mode: ActivityMode }>) {
			boundary = this;
			this.state.mode = 'parked';
			return () =>
				createCompiledVNode(
					Suspense,
					{ fallback: 'loading' },
					createCompiledVNode(
						Activity,
						{ mode: createExpression(() => this.state.mode) },
						createCompiledVNode(Panel, {})
					)
				);
		}
		const container = document.createElement('div');
		render(jsx(Boundary, {}), container);
		expect(container.textContent).toBe('');

		resolve();
		await Promise.resolve();
		expect(container.textContent).toBe('');

		boundary.state.mode = 'active';
		flushSync();
		expect(container.textContent).toBe('');
		for (let index = 0; index < 12; index++) {
			flushSync();
			await Promise.resolve();
			await Promise.resolve();
		}
		flushSync();
		expect(container.textContent).toBe('ready');
		unmount(container);
	});

	it('rejects unsupported modes at the boundary', () => {
		const container = document.createElement('div');
		render(
			createCompiledVNode(Activity, { mode: 'unknown' }, jsx('span', { children: 'x' })),
			container
		);
		expect(container.textContent).toContain('Activity mode must be');
		unmount(container);
	});
});
