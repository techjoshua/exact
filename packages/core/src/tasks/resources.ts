import { batch, mutateReactiveCollection, unwrap, whenEffectScopeResumed } from '@exactjs/reactive';

import { combineAbortSignals, createDisposableAbortSignal, isAbortSignal } from './signals.js';
import { isPromiseLike } from '../component/async-value.js';

import type {
	ComponentInstance,
	TaskCleanup,
	TaskIdleDeadline,
	TaskIdleOptions,
	TaskResourceDisposal
} from '../component/contracts.js';
import type { ExactCollectionMutation } from '../component-contracts.js';

import { createErrorReport, handleComponentError } from '../component/errors.js';
import { TaskCancellation } from './cancellation.js';
import { resumeTaskFrame } from './frame-runtime.js';

import { logFrameworkEvent } from '../component/log.js';

const taskOwners = new WeakMap<AbortSignal, ComponentInstance<any>>();

/** Associates a task generation signal with its component owner. */
export function trackTaskOwner(signal: AbortSignal, owner: ComponentInstance<any>): void {
	taskOwners.set(signal, owner);
}
const taskCleanupPromises = new WeakMap<AbortSignal, Set<Promise<void>>>();
const taskMutations = new WeakMap<AbortSignal, Array<() => void>>();
const taskCollectionMutations = new WeakMap<AbortSignal, ExactCollectionMutation[]>();

/** Stages a compiler-generated mutation until its blocking task generation commits. */
export function stageTaskMutation(signal: AbortSignal, mutation: () => void): void {
	if (signal.aborted) return;
	let staged = taskMutations.get(signal);
	if (!staged) {
		staged = [];
		taskMutations.set(signal, staged);
		signal.addEventListener('abort', () => discardTaskMutations(signal), { once: true });
	}
	staged.push(mutation);
}

/** Publishes staged mutations for a successful task generation as one reactive batch. */
export function publishTaskMutations(signal: AbortSignal): void {
	const staged = taskMutations.get(signal);
	if (!staged) return;
	taskMutations.delete(signal);
	batch(() => {
		for (const mutation of staged) mutation();
	});
}

/** Discards every unpublished mutation owned by a task generation. */
export function discardTaskMutations(signal: AbortSignal): void {
	taskMutations.delete(signal);
	taskCollectionMutations.delete(signal);
}

/**
 * Applies a server-task collection mutation and records the smallest ordered
 * response delta that can reproduce the successful change in the browser.
 */
export function mutateTaskCollection(
	signal: AbortSignal,
	target: object,
	path: readonly PropertyKey[],
	kind: 'map' | 'set',
	method: 'set' | 'add' | 'delete' | 'clear',
	args: unknown[] | (() => unknown[])
): unknown {
	if (signal.aborted) return undefined;
	const input = typeof args === 'function' ? args() : args;
	const collection = readTaskCollection(target, path);
	const raw = unwrap(collection);
	const changed = collectionMutationChanges(raw, kind, method, input);
	const result = mutateReactiveCollection(target, path, kind, method, input);
	if (changed) {
		let mutations = taskCollectionMutations.get(signal);
		if (!mutations) {
			mutations = [];
			taskCollectionMutations.set(signal, mutations);
			signal.addEventListener('abort', () => discardTaskMutations(signal), { once: true });
		}
		mutations.push(collectionMutation(path, kind, method, input));
	}
	return result;
}

/** Takes the ordered collection deltas produced by one successful task generation. */
export function takeTaskCollectionMutations(
	signal: AbortSignal
): readonly ExactCollectionMutation[] | undefined {
	const mutations = taskCollectionMutations.get(signal);
	taskCollectionMutations.delete(signal);
	return mutations?.length ? mutations : undefined;
}

function readTaskCollection(target: object, path: readonly PropertyKey[]): unknown {
	let value: unknown = target;
	for (const segment of path) value = Reflect.get(value as object, segment);
	return value;
}

function collectionMutationChanges(
	value: unknown,
	kind: 'map' | 'set',
	method: string,
	args: readonly unknown[]
): boolean {
	if (kind === 'map' && value instanceof Map) {
		if (method === 'clear') return value.size > 0;
		if (method === 'delete') return value.has(unwrap(args[0]));
		const key = unwrap(args[0]);
		return !value.has(key) || !Object.is(value.get(key), unwrap(args[1]));
	}
	if (kind === 'set' && value instanceof Set) {
		if (method === 'clear') return value.size > 0;
		if (method === 'delete') return value.has(unwrap(args[0]));
		return !value.has(unwrap(args[0]));
	}
	return true;
}

function collectionMutation(
	path: readonly PropertyKey[],
	kind: 'map' | 'set',
	method: string,
	args: readonly unknown[]
): ExactCollectionMutation {
	const location = path.map(String).join('.');
	if (kind === 'map') {
		if (method === 'set')
			return { path: location, operation: 'map-set', key: unwrap(args[0]), value: unwrap(args[1]) };
		if (method === 'delete')
			return { path: location, operation: 'map-delete', key: unwrap(args[0]) };
		return { path: location, operation: 'map-clear' };
	}
	if (method === 'add') return { path: location, operation: 'set-add', value: unwrap(args[0]) };
	if (method === 'delete')
		return { path: location, operation: 'set-delete', value: unwrap(args[0]) };
	return { path: location, operation: 'set-clear' };
}

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

/** Waits for registered task cleanup promises and preserves failures for aggregate reporting. */
export function drainTaskCleanupPromises(
	signal: AbortSignal | undefined
): Promise<void> | undefined {
	if (!signal) return undefined;
	const pending = taskCleanupPromises.get(signal);
	if (!pending?.size) return undefined;
	return Promise.all([...pending]).then(() => undefined);
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
	if (disposal === 'call') {
		if (typeof resource === 'function') return resource();
		return;
	}
	if (!resource || (typeof resource !== 'object' && typeof resource !== 'function')) return;
	if (disposal === 'cancel') return invokeResourceMethod(resource, 'cancel', reason);
	if (disposal) return invokeResourceMethod(resource, disposal);
	const symbols = Symbol as SymbolConstructor & { asyncDispose?: symbol; dispose?: symbol };
	if (symbols.asyncDispose) {
		const result = invokeResourceMethod(resource, symbols.asyncDispose);
		if (result !== undefined) return result;
	}
	if (symbols.dispose) return invokeResourceMethod(resource, symbols.dispose);
}

function invokeResourceMethod(
	resource: object,
	key: PropertyKey,
	...args: unknown[]
): void | Promise<void> | undefined {
	const method = Reflect.get(resource, key) as unknown;
	if (typeof method === 'function') return method.apply(resource, args) as void | Promise<void>;
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
export function taskTimeout<Args extends unknown[]>(
	signal: AbortSignal,
	handler: (...args: Args) => void,
	delay?: number,
	...args: Args
): ReturnType<typeof setTimeout> {
	const abort = () => clearTimeout(timeout);
	const timeout = setTimeout(
		(...values: Args) => {
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

/** Starts an interval whose timer is cleared automatically when the task signal aborts. */
export function taskInterval<Args extends unknown[]>(
	signal: AbortSignal,
	handler: (...args: Args) => void,
	delay?: number,
	...args: Args
): ReturnType<typeof setInterval> {
	const interval = setInterval(
		(...values: Args) => {
			if (!signal.aborted) runTaskCallback(signal, 'interval', () => handler(...values));
		},
		delay,
		...args
	);
	if (signal.aborted) clearInterval(interval);
	else signal.addEventListener('abort', () => clearInterval(interval), { once: true });
	return interval;
}

/** Requests an animation frame that is cancelled automatically with the owning task. */
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

/** Owns an observer instance and disconnects it when the task is cancelled. */
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

/** Runs fetch with the task signal combined with any caller-provided cancellation signal. */
export function taskFetch<T>(
	signal: AbortSignal,
	fetcher: (input: unknown, init?: Record<string, unknown>) => T,
	input: unknown,
	init?: Record<string, unknown>
): T {
	const options = init ? { ...init } : {};
	const existing = options.signal;
	const combined = isAbortSignal(existing)
		? createDisposableAbortSignal(existing, signal)
		: undefined;
	options.signal = combined?.signal ?? signal;
	try {
		const result = fetcher(input, options);
		if (combined && isPromiseLike(result)) {
			void Promise.resolve(result).finally(combined.dispose).catch(ignoreSettlement);
		} else combined?.dispose();
		return result;
	} catch (error) {
		combined?.dispose();
		throw error;
	}
}

function ignoreSettlement(): void {}

/**
 * Awaits a value while retaining task cancellation and Activity parking semantics.
 *
 * The source promise continues while its component scope is paused. Its authored continuation
 * remains parked until the scope resumes, and cancellation can still reject during that wait.
 */
export function taskAwait<T>(signal: AbortSignal, value: T | PromiseLike<T>): Promise<T> {
	if (signal.aborted) return Promise.reject(new TaskCancellation(signal.reason));
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		const abort = () => {
			if (settled) return;
			settled = true;
			resumeTaskFrame(signal, () => reject(new TaskCancellation(signal.reason)));
		};
		signal.addEventListener('abort', abort, { once: true });
		Promise.resolve(value).then(
			async (result) => {
				const owner = taskOwners.get(signal);
				if (owner?.scope.paused) await whenEffectScopeResumed(owner.scope);
				if (settled) return;
				settled = true;
				signal.removeEventListener('abort', abort);
				resumeTaskFrame(signal, () => {
					if (signal.aborted) reject(new TaskCancellation(signal.reason));
					else resolve(result);
				});
			},
			(error) => {
				if (settled) return;
				settled = true;
				signal.removeEventListener('abort', abort);
				resumeTaskFrame(signal, () => reject(error));
			}
		);
	});
}
