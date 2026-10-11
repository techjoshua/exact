/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
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

	it.each(['owner', 'caller', 'same-owner'] as const)(
		'keeps fetch cancellation active after response headers: %s',
		async (from) => {
			const owner = new AbortController();
			const caller = from === 'same-owner' ? owner : new AbortController();
			let selected!: AbortSignal;
			const response = Promise.resolve(new Response('body'));
			const fetcher = (_input: unknown, options?: Record<string, unknown>) => {
				selected = options!.signal as AbortSignal;
				return response;
			};
			expect(taskFetch(owner.signal, fetcher, '/records', { signal: caller.signal })).toBe(
				response
			);
			await response;
			await Promise.resolve();
			expect(selected.aborted).toBe(false);
			(from === 'caller' ? caller : owner).abort('after headers');
			expect(selected.aborted).toBe(true);
			expect(selected.reason).toBe('after headers');
		}
	);

	it.each(['owner', 'caller'] as const)(
		'keeps fallback fetch cancellation active and releases listeners on abort: %s',
		async (from) => {
			const owner = new AbortController();
			const caller = new AbortController();
			const removedOwner = vi.spyOn(owner.signal, 'removeEventListener');
			const removedCaller = vi.spyOn(caller.signal, 'removeEventListener');
			let selected!: AbortSignal;
			vi.stubGlobal('AbortSignal', { any: undefined });
			try {
				const response = taskFetch(
					owner.signal,
					(_input: string, options?: { signal?: AbortSignal }) => {
						selected = options!.signal!;
						return Promise.resolve(new Response('body'));
					},
					'/records',
					{ signal: caller.signal }
				);
				await response;
				(from === 'caller' ? caller : owner).abort('fallback cancelled');
				expect(selected.aborted).toBe(true);
				expect(selected.reason).toBe('fallback cancelled');
				expect(removedOwner).toHaveBeenCalledWith('abort', expect.any(Function));
				expect(removedCaller).toHaveBeenCalledWith('abort', expect.any(Function));
			} finally {
				vi.unstubAllGlobals();
			}
		}
	);

	it('retains Request-carried cancellation unless an explicit init signal replaces it', async () => {
		const owner = new AbortController();
		const caller = new AbortController();
		const replacement = new AbortController();
		const input = new Request('https://example.invalid', { signal: caller.signal });
		const selected: AbortSignal[] = [];
		const fetcher = (_input: Request, options?: RequestInit) => {
			selected.push(options!.signal!);
			return Promise.resolve(new Response('body'));
		};
		await taskFetch(owner.signal, fetcher, input);
		await taskFetch(owner.signal, fetcher, input, { signal: replacement.signal });
		caller.abort('request cancelled');
		expect(selected[0].aborted).toBe(true);
		expect(selected[0].reason).toBe('request cancelled');
		expect(selected[1].aborted).toBe(false);
		replacement.abort('replacement cancelled');
		expect(selected[1].aborted).toBe(true);
		expect(selected[1].reason).toBe('replacement cancelled');
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

it.each(['void', 'promise'] as const)(
	'selects async disposal by method presence, independently of its return value: %s',
	async (result) => {
		const owner = new AbortController();
		const calls: string[] = [];
		const resource = {
			[Symbol.asyncDispose]() {
				calls.push('async');
				return result === 'promise' ? Promise.resolve() : undefined;
			},
			[Symbol.dispose]() {
				calls.push('sync');
			}
		};
		ownTaskResource(owner.signal, resource);
		owner.abort('complete');
		owner.abort('again');
		await Promise.resolve();
		expect(calls).toEqual(['async']);
		const next = new AbortController();
		ownTaskResource(next.signal, {
			[Symbol.dispose]() {
				calls.push('next');
			}
		});
		next.abort();
		expect(calls).toEqual(['async', 'next']);
	}
);
