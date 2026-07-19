import { computed, type ReactiveValue } from '@exact/reactive';

import { combineAbortSignals, createTaskAbortError, isAbortSignal } from './signals.js';

import type {
	ComponentInstance,
	TaskCleanup,
	TaskIdleDeadline,
	TaskIdleOptions,
	TaskResourceDisposal
} from '../component/contracts.js';

import { createErrorReport, handleComponentError } from '../component/errors.js';

import { logFrameworkEvent } from '../component/log.js';

const taskOwners = new WeakMap<AbortSignal, ComponentInstance<any>>();

/** Associates a task generation signal with its component owner. */
export function trackTaskOwner(signal: AbortSignal, owner: ComponentInstance<any>): void {
	taskOwners.set(signal, owner);
}
const taskCleanupPromises = new WeakMap<AbortSignal, Set<Promise<void>>>();

/** Registers once-only task cleanup and reports asynchronous disposal failures. */
export function registerTaskCleanup(signal: AbortSignal, cleanup: TaskCleanup): void {
	let active = true;
	const run = (): void => {
		if (!active) return;
		active = false;
		signal.removeEventListener('abort', run);
		try {
			const result = cleanup(signal.reason);
			if (isPromiseLike(result)) {
				trackTaskCleanupPromise(
					signal,
					Promise.resolve(result).catch((error) => {
						reportTaskResourceError(signal, error);
					})
				);
			}
		} catch (error) {
			reportTaskResourceError(signal, error);
		}
	};
	if (signal.aborted) run();
	else signal.addEventListener('abort', run, { once: true });
}

function trackTaskCleanupPromise(signal: AbortSignal, promise: Promise<void>): void {
	let pending = taskCleanupPromises.get(signal);
	if (!pending) {
		pending = new Set();
		taskCleanupPromises.set(signal, pending);
	}
	pending.add(promise);
	void promise.finally(() => {
		pending!.delete(promise);
		if (!pending!.size) taskCleanupPromises.delete(signal);
	});
}

export function drainTaskCleanupPromises(
	signal: AbortSignal | undefined
): Promise<void> | undefined {
	if (!signal) return undefined;
	const pending = taskCleanupPromises.get(signal);
	if (!pending?.size) return undefined;
	return Promise.all([...pending]).then(() => undefined);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		!!value &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<void>).then === 'function'
	);
}

/** Owns a disposable value while preserving the value and expression result. */
export function ownTaskResource<T>(
	signal: AbortSignal,
	resource: T,
	disposal?: TaskResourceDisposal | ((resource: T, reason?: unknown) => void | Promise<void>)
): T {
	registerTaskCleanup(signal, (reason) => disposeTaskResource(resource, disposal, reason));
	return resource;
}

/** Compiler helper for idle callbacks owned by one task generation. */
export function taskIdleCallback(
	signal: AbortSignal,
	callback: (deadline: TaskIdleDeadline) => void,
	options?: TaskIdleOptions
): number {
	const platform = globalThis as typeof globalThis & {
		requestIdleCallback(
			callback: (deadline: TaskIdleDeadline) => void,
			options?: TaskIdleOptions
		): number;
		cancelIdleCallback(handle: number): void;
	};
	let handle = 0;
	const cancel = () => platform.cancelIdleCallback(handle);
	handle = platform.requestIdleCallback((deadline) => {
		signal.removeEventListener('abort', cancel);
		if (!signal.aborted) runTaskCallback(signal, 'idle-callback', () => callback(deadline));
	}, options);
	if (signal.aborted) cancel();
	else signal.addEventListener('abort', cancel, { once: true });
	return handle;
}

function disposeTaskResource<T>(
	resource: T,
	disposal:
		| TaskResourceDisposal
		| ((resource: T, reason?: unknown) => void | Promise<void>)
		| undefined,
	reason: unknown
): void | Promise<void> {
	if (typeof disposal === 'function') return disposal(resource, reason);
	const value = resource as any;
	if (disposal === 'call') return value();
	if (disposal === 'cancel') return value?.cancel?.(reason);
	if (disposal) return value?.[disposal]?.();
	const asyncDispose = (Symbol as any).asyncDispose;
	if (asyncDispose && typeof value?.[asyncDispose] === 'function') return value[asyncDispose]();
	const dispose = (Symbol as any).dispose;
	if (dispose && typeof value?.[dispose] === 'function') return value[dispose]();
}

function reportTaskResourceError(signal: AbortSignal, error: unknown): void {
	const instance = taskOwners.get(signal);
	if (instance) {
		handleComponentError(instance, createErrorReport(error, 'task', instance, 'resource-cleanup'));
		return;
	}
	logFrameworkEvent('error', 'core', 'task', 'task resource cleanup failed', error);
}

/** Compiler helpers for resources whose lifetime is owned by a task generation. */
export function taskTimeout(
	signal: AbortSignal,
	handler: (...args: any[]) => void,
	delay?: number,
	...args: any[]
): ReturnType<typeof setTimeout> {
	const abort = () => clearTimeout(timeout);
	const timeout = setTimeout(
		(...values: any[]) => {
			signal.removeEventListener('abort', abort);
			if (!signal.aborted) runTaskCallback(signal, 'timeout', () => handler(...values));
		},
		delay,
		...args
	);
	if (signal.aborted) abort();
	else signal.addEventListener('abort', abort, { once: true });
	return timeout;
}

export function taskInterval(
	signal: AbortSignal,
	handler: (...args: any[]) => void,
	delay?: number,
	...args: any[]
): ReturnType<typeof setInterval> {
	const interval = setInterval(
		(...values: any[]) => {
			if (!signal.aborted) runTaskCallback(signal, 'interval', () => handler(...values));
		},
		delay,
		...args
	);
	if (signal.aborted) clearInterval(interval);
	else signal.addEventListener('abort', () => clearInterval(interval), { once: true });
	return interval;
}

export function taskAnimationFrame(signal: AbortSignal, handler: (time: number) => void): number {
	const platform = globalThis as typeof globalThis & {
		requestAnimationFrame(callback: (time: number) => void): number;
		cancelAnimationFrame(id: number): void;
	};
	let frame = 0;
	const cancel = () => platform.cancelAnimationFrame(frame);
	frame = platform.requestAnimationFrame((time) => {
		signal.removeEventListener('abort', cancel);
		if (!signal.aborted) runTaskCallback(signal, 'animation-frame', () => handler(time));
	});
	if (signal.aborted) cancel();
	else signal.addEventListener('abort', cancel, { once: true });
	return frame;
}

export function taskObserver<T extends { disconnect(): void }>(
	signal: AbortSignal,
	observer: T
): T {
	registerTaskCleanup(signal, () => observer.disconnect());
	return observer;
}

function runTaskCallback(signal: AbortSignal, phase: string, callback: () => void): void {
	try {
		callback();
	} catch (error) {
		const instance = taskOwners.get(signal);
		if (instance) handleComponentError(instance, createErrorReport(error, 'task', instance, phase));
		else reportTaskResourceError(signal, error);
	}
}

export function taskFetch<T>(
	signal: AbortSignal,
	fetcher: (...args: any[]) => T,
	input: unknown,
	init?: Record<string, unknown>
): T {
	const options = init ? { ...init } : {};
	const existing = options.signal;
	options.signal = isAbortSignal(existing) ? combineAbortSignals(existing, signal) : signal;
	return fetcher(input, options);
}

export function taskAwait<T>(signal: AbortSignal, value: T | PromiseLike<T>): Promise<T> {
	if (signal.aborted) return Promise.reject(createTaskAbortError(signal.reason));
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		const abort = () => {
			if (settled) return;
			settled = true;
			reject(createTaskAbortError(signal.reason));
		};
		signal.addEventListener('abort', abort, { once: true });
		Promise.resolve(value).then(
			(result) => {
				if (settled) return;
				settled = true;
				signal.removeEventListener('abort', abort);
				resolve(result);
			},
			(error) => {
				if (settled) return;
				settled = true;
				signal.removeEventListener('abort', abort);
				reject(error);
			}
		);
	});
}

/** Compiler runtime hook for a shared, lazily evaluated derived component value. */
export function createDerived<T>(compute: () => T): ReactiveValue<T> {
	return computed(compute);
}
