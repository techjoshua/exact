/**
 * @vitest-environment jsdom
 */
import './structural-boundaries.js';
import '@exactjs/core/runtime/refs';
import './runtime/root-release.js';
import {
	Activity,
	Suspense,
	activateTaskForHost,
	createRef,
	componentReadinessContext,
	defineTask,
	stageTaskMutation,
	taskAwait,
	type ActivityMode,
	type AnyComponentInstance,
	type Component,
	type RootLifecycle
} from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import { createCompiledOperation, jsx } from './test-support/native-operations.js';
import { flushSync, runWithPriority } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';
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
	it.each([false, true])(
		'reports readiness publication failure without activating a failed parked candidate (parent Suspense: %s)',
		async (parentSuspense) => {
			let settle!: () => void;
			const pending = new Promise<void>((resolve) => {
				settle = resolve;
			});
			let boundary!: Component<{ mode: ActivityMode }>;
			const failure = new Error('activity publication failed');
			const report = vi.fn();
			const disposed = vi.fn();
			function Panel(this: Component<{}>) {
				this.onUnmount(disposed);
				const owner = this as unknown as AnyComponentInstance;
				componentReadinessContext(owner)!.register({
					owner,
					taskGeneration: 1,
					settlement: pending,
					commit() {
						throw failure;
					}
				});
				return () => createCompiledOperation('p', null, 'candidate');
			}
			function Boundary(this: Component<{ mode: ActivityMode }>) {
				boundary = this;
				this.state.mode = 'parked';
				return () => {
					const activity = createCompiledOperation(
						Activity,
						{ mode: createExpression(() => this.state.mode) },
						createCompiledOperation(Panel, {})
					);
					return parentSuspense
						? createCompiledOperation(Suspense, { fallback: 'loading' }, activity)
						: activity;
				};
			}
			const container = document.createElement('div');
			render(jsx(Boundary, {}), container, { onErrorReport: report });
			try {
				boundary.state.mode = 'active';
				flushSync();
				settle();
				for (let turn = 0; turn < 5; turn++) await Promise.resolve();
				expect(report).toHaveBeenCalledOnce();
				expect(report.mock.calls[0]?.[0].error).toBe(failure);
				expect(container.textContent).not.toContain('candidate');
				expect(unmount(container)).toBe(true);
				render(createCompiledOperation('p', null, 'recovered'), container);
				expect(container.textContent).toBe('recovered');
				expect(disposed).toHaveBeenCalledOnce();
				await Promise.resolve();
				expect(report).toHaveBeenCalledOnce();
			} finally {
				unmount(container);
			}
		}
	);
	it('parks a subtree without disposing it and publishes accumulated work before activation', () => {
		const buttonRef = createRef<HTMLButtonElement>('counter');
		let boundary!: Component<{ mode: ActivityMode }>;
		let counter!: Component<{ count: number }>;
		let counterRoot!: RootLifecycle<Element>;

		function Counter(this: Component<{ count: number }>) {
			counter = this;
			counterRoot = this.refs.root();
			this.state.count = 0;
			return () =>
				createCompiledOperation(
					'button',
					{ ref: this.ref(buttonRef) },
					createExpression(() => this.state.count)
				);
		}

		function Boundary(this: Component<{ mode: ActivityMode }>) {
			boundary = this;
			this.state.mode = 'active';
			return () =>
				createCompiledOperation(
					Activity,
					{ mode: createExpression(() => this.state.mode) },
					createCompiledOperation(Counter, {})
				);
		}

		const container = document.createElement('div');
		render(jsx(Boundary, {}), container);
		const button = container.querySelector('button')!;

		boundary.state.mode = 'parked';
		flushSync();
		expect(container.querySelector('button')).toBeNull();
		expect(counter.refs.get(buttonRef)).toBe(button);
		expect(counterRoot.current).toBe(button);
		expect(counterRoot.presented).toBe(false);
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
		expect(counterRoot.presented).toBe(true);

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
				createCompiledOperation(
					'p',
					{},
					createExpression(() => this.state.label)
				);
		}

		function Boundary(this: Component<{ mode: ActivityMode }>) {
			boundary = this;
			this.state.mode = 'background';
			return () =>
				createCompiledOperation(
					Activity,
					{ mode: createExpression(() => this.state.mode) },
					createCompiledOperation(Panel, {})
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
				createCompiledOperation(
					'p',
					{},
					createExpression(() => this.state.label)
				);
		}
		function Boundary(this: Component<{ mode: ActivityMode }>) {
			boundary = this;
			this.state.mode = 'parked';
			return () =>
				createCompiledOperation(
					Suspense,
					{ fallback: 'loading' },
					createCompiledOperation(
						Activity,
						{ mode: createExpression(() => this.state.mode) },
						createCompiledOperation(Panel, {})
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
			createCompiledOperation(Activity, { mode: 'unknown' }, jsx('span', { children: 'x' })),
			container
		);
		expect(container.textContent).toContain('Activity mode must be');
		unmount(container);
	});
});
