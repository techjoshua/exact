import { describe, expect, it, vi } from 'vitest';
import {
	ErrorContext,
	attachSuppressedCleanupFailure,
	attemptCleanup,
	createCleanupFailure,
	createComponentInstance,
	createErrorContext,
	ownTaskResource,
	registerTaskCleanup,
	stageTaskMutation,
	taskAwait,
	taskIdleCallback,
	taskObserver,
	taskTimeout,
	throwCleanupFailure,
	withAbortSignal,
	withTaskSignal,
	type Component,
	type ErrorReport
} from './index.js';

describe('@exactjs/core task-resources', () => {
	it('runs every cleanup and can retain cleanup failure on a primary error', () => {
		const calls: number[] = [];
		const failure = createCleanupFailure();
		attemptCleanup(failure, () => {
			calls.push(1);
			throw new Error('cleanup');
		});
		attemptCleanup(failure, () => {
			calls.push(2);
		});
		expect(calls).toEqual([1, 2]);
		expect(() => throwCleanupFailure(failure)).toThrow('cleanup');

		const primary = new Error('primary');
		attachSuppressedCleanupFailure(primary, failure.error);
		expect((primary as Error & { suppressed?: unknown[] }).suppressed).toEqual([failure.error]);
	});

	it('rejects task registration after component setup', () => {
		let registerLate!: () => void;
		createComponentInstance(function Panel(this: Component<{}>) {
			registerLate = () => (this as any).task(() => undefined);
			return () => null;
		}, {});
		expect(registerLate).toThrow('this.task() must be registered during component setup');
	});

	it('cancels compiler-owned resources and stale awaits', async () => {
		vi.useFakeTimers();
		try {
			const controller = new AbortController();
			const callback = vi.fn();
			taskTimeout(controller.signal, callback, 10);
			const observer = { disconnect: vi.fn() };
			expect(taskObserver(controller.signal, observer)).toBe(observer);
			const awaited = taskAwait(controller.signal, Promise.resolve('value'));
			controller.abort('rerun');
			await expect(awaited).rejects.toMatchObject({ name: 'AbortError' });
			vi.runAllTimers();
			expect(callback).not.toHaveBeenCalled();
			expect(observer.disconnect).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});
	it('lets awaited work settle while parking its authored continuation', async () => {
		let resolveValue!: (value: string) => void;
		const value = new Promise<string>((resolve) => {
			resolveValue = resolve;
		});
		let continued: string | undefined;
		const component = createComponentInstance(function Worker(this: Component<{}>) {
			(this as any).task(async ({ signal }: { signal: AbortSignal }) => {
				continued = await taskAwait(signal, value);
			});
			return () => null;
		}, {});

		component.markMounted();
		component.scope.pause();
		resolveValue('settled');
		await Promise.resolve();
		await Promise.resolve();
		expect(continued).toBeUndefined();

		component.scope.resume();
		await Promise.resolve();
		await Promise.resolve();
		expect(continued).toBe('settled');
		component.unmount();
	});
	it('publishes root blocking task mutations without requiring an authored boundary', async () => {
		let instance!: Component<{ ready: boolean }>;
		createComponentInstance(function Worker(this: Component<{ ready: boolean }>) {
			instance = this;
			this.state.ready = false;
			(this as any).task.blocking(async ({ signal }: { signal: AbortSignal }) => {
				await Promise.resolve();
				stageTaskMutation(signal, () => {
					this.state.ready = true;
				});
			});
			return () => null;
		}, {});

		expect(instance.state.ready).toBe(false);
		for (let index = 0; index < 6; index++) await Promise.resolve();
		expect(instance.state.ready).toBe(true);
	});
	it('combines compiler-owned abort signals with listener options', () => {
		const owner = new AbortController();
		const external = new AbortController();
		const managed = withAbortSignal({ capture: true, signal: external.signal }, owner.signal);
		expect(managed.capture).toBe(true);
		expect(managed.signal?.aborted).toBe(false);
		owner.abort('unmount');
		expect(managed.signal?.aborted).toBe(true);
	});
	it('owns generic task resources and runs cleanup exactly once', async () => {
		const controller = new AbortController();
		const close = vi.fn();
		const terminate = vi.fn();
		const unsubscribe = vi.fn();
		const cleanup = vi.fn();
		const dispose = vi.fn();
		const asyncDispose = vi.fn(async () => undefined);
		expect(ownTaskResource(controller.signal, { close }, 'close')).toEqual({ close });
		ownTaskResource(controller.signal, { terminate }, 'terminate');
		ownTaskResource(controller.signal, unsubscribe, 'call');
		if ((Symbol as any).dispose)
			ownTaskResource(controller.signal, { [(Symbol as any).dispose]: dispose });
		if ((Symbol as any).asyncDispose)
			ownTaskResource(controller.signal, { [(Symbol as any).asyncDispose]: asyncDispose });
		registerTaskCleanup(controller.signal, cleanup);

		controller.abort('rerun');
		controller.abort('again');
		await Promise.resolve();

		expect(close).toHaveBeenCalledTimes(1);
		expect(terminate).toHaveBeenCalledTimes(1);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		if ((Symbol as any).dispose) expect(dispose).toHaveBeenCalledTimes(1);
		if ((Symbol as any).asyncDispose) expect(asyncDispose).toHaveBeenCalledTimes(1);
		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(cleanup).toHaveBeenCalledWith('rerun');
	});

	it('routes task resource disposal failures through the owning error context', async () => {
		let instance!: Component<{ errors: ErrorReport[] }>;
		const component = createComponentInstance(function Worker(
			this: Component<{ errors: ErrorReport[] }>
		) {
			instance = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));
			(this as any).task(({ signal }: { signal: AbortSignal }) => {
				ownTaskResource(
					signal,
					{
						close: async () => {
							throw new Error('close failed');
						}
					},
					'close'
				);
			});
			return () => null;
		}, {});

		component.markMounted();
		component.unmount();
		await Promise.resolve();
		await Promise.resolve();

		expect(instance.state.errors).toHaveLength(1);
		expect(instance.state.errors[0]).toMatchObject({ source: 'task', phase: 'resource-cleanup' });
	});
	it('combines task signals with typed API options', () => {
		const owner = new AbortController();
		const external = new AbortController();
		const options = withTaskSignal({ cache: 'reload', signal: external.signal }, owner.signal);
		expect(options.cache).toBe('reload');
		owner.abort('rerun');
		expect(options.signal.aborted).toBe(true);
	});
	it('cancels compiler-owned idle callbacks', () => {
		const request = vi.fn(() => 42);
		const cancel = vi.fn();
		vi.stubGlobal('requestIdleCallback', request);
		vi.stubGlobal('cancelIdleCallback', cancel);
		try {
			const controller = new AbortController();
			expect(taskIdleCallback(controller.signal, () => undefined)).toBe(42);
			controller.abort('unmount');
			expect(cancel).toHaveBeenCalledWith(42);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
