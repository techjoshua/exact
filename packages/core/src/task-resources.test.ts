import { describe, expect, it, vi } from 'vitest';
import {
	attachSuppressedCleanupFailure,
	attemptCleanup,
	createCleanupFailure,
	ownTaskResource,
	registerTaskCleanup,
	taskAwait,
	taskFetch,
	taskIdleCallback,
	taskObserver,
	taskTimeout,
	throwCleanupFailure,
	withAbortSignal,
	withTaskSignal
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

	it('combines task signals with typed API options', () => {
		const owner = new AbortController();
		const external = new AbortController();
		const options = withTaskSignal({ cache: 'reload', signal: external.signal }, owner.signal);
		expect(options.cache).toBe('reload');
		owner.abort('rerun');
		expect(options.signal.aborted).toBe(true);
	});

	it('releases combined fetch cancellation listeners when the request settles', async () => {
		const owner = new AbortController();
		const external = new AbortController();
		const removeOwner = vi.spyOn(owner.signal, 'removeEventListener');
		const removeExternal = vi.spyOn(external.signal, 'removeEventListener');
		let settle!: () => void;
		const response = new Promise<void>((resolve) => (settle = resolve));
		const fetcher = vi.fn(() => response);

		expect(taskFetch(owner.signal, fetcher, '/records', { signal: external.signal })).toBe(
			response
		);
		settle();
		await response;
		await Promise.resolve();

		expect(removeOwner).toHaveBeenCalledWith('abort', expect.any(Function));
		expect(removeExternal).toHaveBeenCalledWith('abort', expect.any(Function));
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
