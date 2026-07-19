import { flushSync, watch } from '@exact/reactive';
import { describe, expect, it, vi } from 'vitest';
import {
	ErrorContext,
	createComponentInstance,
	createErrorContext,
	createVNode,
	isVNode,
	renderInstance,
	taskAwait,
	taskTimeout,
	withTaskObserver,
	type Component,
	type ErrorReport,
	type TaskObserver
} from './index.js';

describe('@exact/core errors', () => {
	it('routes render failures to the nearest error context', () => {
		let instance!: Component<{ errors: ErrorReport[] }>;

		const component = createComponentInstance(function Broken(
			this: Component<{ errors: ErrorReport[] }>
		) {
			instance = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));

			return () => {
				if (this.state.errors.length) return createVNode('span', null, 'fallback');
				throw new Error('render failed');
			};
		}, {});

		renderInstance(component, () => renderInstance(component, () => undefined));
		flushSync();
		const nodes = renderInstance(component, () => undefined);

		expect(instance.state.errors).toHaveLength(1);
		expect(instance.state.errors[0]!.source).toBe('render');
		expect(isVNode(nodes[0]) ? nodes[0].children[0] : undefined).toBe('fallback');
	});

	it('routes synchronous task failures to the nearest error context', () => {
		let instance!: Component<{ errors: ErrorReport[] }>;

		createComponentInstance(function Worker(this: Component<{ errors: ErrorReport[] }>) {
			instance = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));
			this.task(() => {
				throw new Error('task failed');
			});
			return () => null;
		}, {});

		expect(instance.state.errors).toHaveLength(1);
		expect(instance.state.errors[0]!.id).toMatch(/^e\d+$/);
		expect(instance.state.errors[0]!.source).toBe('task');
		expect(instance.state.errors[0]!.phase).toBe('run');
	});

	it('supports explicit server and client task aliases at runtime', () => {
		let instance!: Component<{ value: number; serverRuns: number; clientRuns: number }>;

		createComponentInstance(function Worker(
			this: Component<{ value: number; serverRuns: number; clientRuns: number }>
		) {
			instance = this;
			this.state.value = 1;
			this.state.serverRuns = 0;
			this.state.clientRuns = 0;
			this.task.server(
				this.reactive<number>(() => this.state.value),
				(value) => {
					this.state.serverRuns = value;
				}
			);
			this.task.client(
				this.reactive<number>(() => this.state.value),
				(value) => {
					this.state.clientRuns = value;
				}
			);
			return () => null;
		}, {});

		expect(instance.state.serverRuns).toBe(1);
		expect(instance.state.clientRuns).toBe(1);

		instance.state.value = 2;
		flushSync();

		expect(instance.state.serverRuns).toBe(2);
		expect(instance.state.clientRuns).toBe(2);
	});

	it('assigns stable ids to multiple error reports', () => {
		let instance!: Component<{ errors: ErrorReport[] }>;

		createComponentInstance(function Worker(this: Component<{ errors: ErrorReport[] }>) {
			instance = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));
			this.task(() => {
				throw new Error('first task failed');
			});
			this.task(() => {
				throw new Error('second task failed');
			});
			return () => null;
		}, {});

		expect(instance.state.errors).toHaveLength(2);
		expect(instance.state.errors[0]!.id).not.toBe(instance.state.errors[1]!.id);
	});

	it('lets components report and clear errors through error context', () => {
		let instance!: Component<{ errors: ErrorReport[] }>;
		let report!: ErrorReport;

		const parent = createComponentInstance(function Boundary(
			this: Component<{ errors: ErrorReport[] }>
		) {
			instance = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));
			return () => null;
		}, {});

		createComponentInstance(
			function Reporter(this: Component<{}>) {
				const errors = this.getContext(ErrorContext);
				report = errors.report(new Error('manual failure'), {
					source: 'component',
					phase: 'validate'
				});
				errors.clear(report.id);
				errors.report('second failure');
				errors.clearAll();
				return () => null;
			},
			{},
			parent
		);

		expect(report.source).toBe('component');
		expect(report.phase).toBe('validate');
		expect(instance.state.errors).toHaveLength(0);
	});

	it('makes plain error context arrays reactive', () => {
		const errors = createErrorContext([]);
		let count = 0;

		const stop = watch(() => {
			void errors.errors.length;
			count++;
		});

		errors.report('first');
		flushSync();
		errors.clearAll();
		flushSync();
		stop();

		expect(count).toBe(3);
	});

	it('routes rejected task promises to the nearest error context', async () => {
		let instance!: Component<{ errors: ErrorReport[] }>;

		createComponentInstance(function Worker(this: Component<{ errors: ErrorReport[] }>) {
			instance = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));
			this.task(async () => {
				throw new Error('async task failed');
			});
			return () => null;
		}, {});

		await Promise.resolve();
		await Promise.resolve();

		expect(instance.state.errors).toHaveLength(1);
		expect(instance.state.errors[0]!.source).toBe('task');
		expect(instance.state.errors[0]!.phase).toBe('promise');
	});

	it('lets render environments observe async task completion', async () => {
		const observed: Promise<unknown>[] = [];
		const observer: TaskObserver = {
			register: (promise) => observed.push(promise)
		};
		let instance!: Component<{ ready: boolean }>;

		withTaskObserver(observer, () => {
			createComponentInstance(function Worker(this: Component<{ ready: boolean }>) {
				instance = this;
				this.state.ready = false;
				this.task(async () => {
					await Promise.resolve();
					this.state.ready = true;
				});
				return () => null;
			}, {});
		});

		expect(observed).toHaveLength(1);
		await Promise.all(observed);
		expect(instance.state.ready).toBe(true);
	});

	it('continues unmount cleanup after lifecycle failures', () => {
		let instance!: Component<{ errors: ErrorReport[] }>;
		const cleanup = vi.fn();

		const component = createComponentInstance(function Worker(
			this: Component<{ errors: ErrorReport[] }>
		) {
			instance = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));
			this.onUnmount(() => {
				throw new Error('unmount failed');
			});
			this.onUnmount(cleanup);
			return () => null;
		}, {});

		component.markMounted();
		component.unmount();

		expect(instance.state.errors).toHaveLength(1);
		expect(instance.state.errors[0]!.source).toBe('lifecycle');
		expect(instance.state.errors[0]!.phase).toBe('unmount');
		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it('finishes component teardown before rethrowing a synchronous ownership failure', () => {
		const cleanup = vi.fn();
		const component = createComponentInstance(function Worker(this: Component<{}>) {
			this.onUnmount(cleanup);
			return () => null;
		}, {}) as any;
		component.scope.reactions.add({
			stop() {
				throw new Error('reaction stop failed');
			}
		});

		expect(() => component.unmount()).toThrow('reaction stop failed');
		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(component.mounted).toBe(false);
		expect(() => component.unmount()).not.toThrow();
	});

	it('actively aborts taskAwait even when its input never settles', async () => {
		const controller = new AbortController();
		const awaited = taskAwait(controller.signal, new Promise<string>(() => undefined));
		controller.abort('rerun');
		await expect(awaited).rejects.toMatchObject({ name: 'AbortError', message: 'rerun' });
	});

	it('disposes tasks when a component is removed before it mounts', () => {
		const cleanup = vi.fn();
		const component = createComponentInstance(function Pending(this: Component<{}>) {
			this.task(() => cleanup);
			return () => null;
		}, {});
		component.unmount('discarded-before-mount');
		component.markMounted();
		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(component.mounted).toBe(false);
	});

	it('routes compiler-owned timer and asynchronous render lifecycle errors', async () => {
		vi.useFakeTimers();
		try {
			let instance!: Component<{ errors: ErrorReport[] }>;
			const component = createComponentInstance(function Worker(
				this: Component<{ errors: ErrorReport[] }>
			) {
				instance = this;
				this.state.errors = [];
				this.setContext(ErrorContext, createErrorContext(this.state.errors));
				this.task(({ signal }) => {
					taskTimeout(
						signal,
						() => {
							throw new Error('timer failed');
						},
						1
					);
				});
				this.onRender(async () => {
					throw new Error('render hook failed');
				});
				return () => null;
			}, {});
			renderInstance(component, () => undefined);
			vi.runAllTimers();
			await Promise.resolve();
			expect(instance.state.errors.map((error) => error.phase).sort()).toEqual([
				'render',
				'timeout'
			]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('isolates the framework error context between application roots', () => {
		const failing = () =>
			createComponentInstance(function Root(this: Component<{}>) {
				return () => {
					throw new Error('root failure');
				};
			}, {});
		const first = failing();
		const second = createComponentInstance(function Root(this: Component<{}>) {
			return () => null;
		}, {});
		const firstChild = createComponentInstance(
			function Child(this: Component<{}>) {
				return () => null;
			},
			{},
			first
		);
		const secondChild = createComponentInstance(
			function Child(this: Component<{}>) {
				return () => null;
			},
			{},
			second
		);
		renderInstance(first, () => undefined);
		expect(firstChild.getContext(ErrorContext).errors).toHaveLength(1);
		expect(secondChild.getContext(ErrorContext).errors).toHaveLength(0);
	});
});
