import { cleanupReaction, getDep, runTracked, track, trigger } from './internal/deps.js';

import { isPlainObject } from './internal/objects.js';

import { currentEffectScope } from './internal/scopes.js';

import { queueComputation, queueReaction, removeQueuedComputation } from './internal/scheduler.js';

import { reactiveValueMarker, reactiveValueRef } from './internal/symbols.js';

import { isReactiveValue, unwrap } from './internal/values.js';

import type {
	EffectScopeImpl,
	Reaction,
	Reactive,
	ReactiveOptions,
	ReactiveRef,
	ReactiveValue,
	StopHandle,
	WatchOptions
} from './internal/types.js';

import { createReactive } from './proxy/create.js';

import { defaultReactiveOptions, proxyRefs } from './proxy/state.js';

import { hasChanged, isReactiveContainer } from './change-detection.js';

/** Creates a reactive proxy that tracks reads and notifies watchers when writable state changes. */
export function reactive<T extends object>(
	value: T,
	options: ReactiveOptions = defaultReactiveOptions
): Reactive<T> {
	if (!isReactiveContainer(unwrap(value))) return value as Reactive<T>;
	return createReactive(value, options) as Reactive<T>;
}

/** Creates a lazy derived reactive value that recomputes when one of its tracked dependencies changes. */
export function computed<T>(compute: () => T): ReactiveValue<T> {
	const scope = currentEffectScope();
	const target = {};
	const key = 'value';
	let initialized = false;
	let current: T;
	let stop: StopHandle | undefined;
	let queued = false;
	let computeFailed = false;

	const source: ReactiveRef<T> = {
		target,
		key,
		get() {
			if (queued) recomputeAndNotify();
			else ensure();
			track(target, key);
			return current;
		},
		set() {
			throw new TypeError('Cannot write to readonly reactive value');
		}
	};

	function ensure(): void {
		if (scope && !scope.active) return;
		if (stop) return;

		computeFailed = false;
		stop = watch(
			() => {
				const computedValue = compute();
				ref(computedValue)?.get();
				const next = unwrap(computedValue) as T;
				if (!initialized) {
					current = next;
					initialized = true;
					return;
				}

				if (hasChanged(current, next)) current = next;
			},
			queueRecompute,
			{
				scope,
				onError(error) {
					computeFailed = true;
					if (scope?.onError) scope.onError(error);
					else throw error;
				}
			}
		);
	}

	function queueRecompute(): void {
		if (scope && !scope.active) return;
		if (queued) return;
		queued = true;
		queueComputation(recomputeAndNotify, scope?.onError);
	}

	function recomputeAndNotify(): void {
		// A computed value tears down and rebuilds its watcher on each flush so dependency
		// sets follow the latest branch of the compute function instead of stale reads.
		queued = false;
		removeQueuedComputation(recomputeAndNotify);
		if (scope && !scope.active) return;
		stop?.();
		stop = undefined;
		const previous = initialized ? current : undefined;
		const hadValue = initialized;
		ensure();
		if (computeFailed) return;
		if (!hadValue || hasChanged(previous, current)) {
			trigger(target, key);
		}
	}

	return {
		[reactiveValueMarker]: true,
		[reactiveValueRef]: source,
		get: () => source.get(),
		toJSON: () => source.get(),
		toString: () => String(source.get()),
		valueOf: () => source.get(),
		[Symbol.toPrimitive]: () => source.get()
	} as ReactiveValue<T>;
}

/** Runs a tracked function immediately and schedules it again whenever its dependencies change. */
export function watch(
	fn: () => void,
	scheduler?: () => void,
	options: WatchOptions = {}
): StopHandle {
	const scope = (options.scope ?? currentEffectScope()) as EffectScopeImpl | undefined;
	const handleError = (error: unknown): void => {
		const onError = options.onError ?? scope?.onError;
		if (!onError) throw error;
		onError(error);
	};
	const reaction: Reaction = {
		active: true,
		scheduled: false,
		scope,
		deps: new Set(),
		run() {
			if (!reaction.active) return;
			if (reaction.scope && !reaction.scope.active) {
				reaction.stop();
				return;
			}
			reaction.scheduled = false;
			try {
				runTracked(reaction, fn);
			} catch (error) {
				handleError(error);
			}
		},
		schedule() {
			if (!reaction.active) return;
			if (reaction.scope && !reaction.scope.active) {
				reaction.stop();
				return;
			}
			if (reaction.scheduled) return;
			reaction.scheduled = true;
			try {
				options.onSchedule?.();
				if (scheduler) {
					scheduler();
					return;
				}
				queueReaction(reaction);
			} catch (error) {
				// A failed scheduler did not arrange for run() to clear this bit. Reset it
				// so a later dependency change can retry rather than wedging the watcher.
				reaction.scheduled = false;
				handleError(error);
			}
		},
		stop() {
			reaction.active = false;
			reaction.scheduled = false;
			cleanupReaction(reaction);
			reaction.scope?.reactions.delete(reaction);
		}
	};

	scope?.reactions.add(reaction);
	try {
		reaction.run();
	} catch (error) {
		// A caller cannot stop a watcher whose initial run failed before the stop
		// handle was returned. Tear it down here so dependencies and scope
		// ownership cannot leak.
		reaction.stop();
		throw error;
	}
	return reaction.stop;
}

/** Subscribes directly to a reactive reference without running a dependency collection pass. */
export function subscribe<T>(
	source: ReactiveRef<T>,
	callback: () => void,
	options: WatchOptions = {}
): StopHandle {
	const scope = (options.scope ?? currentEffectScope()) as EffectScopeImpl | undefined;
	const handleError = (error: unknown): void => {
		const onError = options.onError ?? scope?.onError;
		if (!onError) throw error;
		onError(error);
	};
	const dep = getDep(source.target, source.key);
	const reaction: Reaction = {
		active: true,
		scheduled: false,
		deps: new Set([dep]),
		run() {
			reaction.scheduled = false;
			if (!reaction.active || (scope && !scope.active)) {
				reaction.stop();
				return;
			}
			try {
				callback();
			} catch (error) {
				handleError(error);
			}
		},
		schedule() {
			if (!reaction.active || (scope && !scope.active)) {
				reaction.stop();
				return;
			}
			if (reaction.scheduled) return;
			reaction.scheduled = true;
			queueReaction(reaction);
		},
		stop() {
			reaction.active = false;
			reaction.scheduled = false;
			cleanupReaction(reaction);
			scope?.reactions.delete(reaction);
		}
	};

	dep.add(reaction);
	scope?.reactions.add(reaction);
	return reaction.stop;
}

/** Returns the reactive reference that drives a reactive value or proxied object, when available. */
export function ref<T>(value: ReactiveValue<T>): ReactiveRef<T>;
export function ref<T>(value: T): ReactiveRef<T> | undefined;
export function ref<T>(value: T): ReactiveRef<T> | undefined {
	if (isReactiveValue(value)) {
		value.get();
		return value[reactiveValueRef] as ReactiveRef<T>;
	}

	if (value && typeof value === 'object') {
		return proxyRefs.get(value as object) as ReactiveRef<T> | undefined;
	}

	return undefined;
}

/** Creates a plain recursive snapshot of reactive state for serialization or comparison. */
export function snapshot<T>(value: T): T {
	const root = unwrap(value);
	if (!root || typeof root !== 'object' || (!Array.isArray(root) && !isPlainObject(root)))
		return root;
	const output: any = Array.isArray(root) ? [] : Object.create(Object.getPrototypeOf(root));
	const seen = new WeakMap<object, unknown>([[root, output]]);
	const pending: Array<{ source: any; target: any }> = [{ source: root, target: output }];
	while (pending.length) {
		const { source, target } = pending.pop()!;
		if (Array.isArray(source)) target.length = source.length;
		const keys: PropertyKey[] = Array.isArray(source)
			? Array.from({ length: source.length }, (_, index) => index).filter((index) =>
					Reflect.has(source, index)
				)
			: Reflect.ownKeys(source);
		for (const key of keys) {
			const child = unwrap(source[key]);
			if (!child || typeof child !== 'object' || (!Array.isArray(child) && !isPlainObject(child))) {
				target[key] = child;
				continue;
			}
			const prior = seen.get(child);
			if (prior) {
				target[key] = prior;
				continue;
			}
			const clone: any = Array.isArray(child) ? [] : Object.create(Object.getPrototypeOf(child));
			seen.set(child, clone);
			target[key] = clone;
			pending.push({ source: child, target: clone });
		}
	}
	return output as T;
}
