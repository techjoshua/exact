import { cleanupReaction, getDep, runTracked, track, trigger } from './internal/deps.js';

import {
	currentEffectScope,
	effectScopeWorkPriority,
	registerEffectScopeReaction,
	releaseEffectScopeReaction,
	withEffectScope
} from './internal/scopes.js';

import {
	currentWorkPriority,
	isHigherWorkPriority,
	queueComputation,
	queueReaction,
	removeQueuedComputation
} from './internal/scheduler.js';

import { iterateKey, reactiveValueMarker, reactiveValueRef } from './internal/symbols.js';

import { isReactive, isReactiveValue, unwrap } from './internal/values.js';

import type {
	Dep,
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

const inactiveWatch: StopHandle = () => undefined;
const collectionRefs = new WeakMap<object, ReactiveRef<object>>();

/** Configures framework ownership notification for a watcher that may retire after execution. */
export type RetainedWatchOptions = WatchOptions & {
	/** Runs once when the watcher releases its dependencies and scope registration. */
	onRelease?(): void;
	/** Returns the shared reaction object for framework owners instead of allocating a handle. */
	owned?: boolean;
};

/** Framework-owned retained reaction whose shared stop method avoids a per-binding handle closure. */
export type OwnedRetainedWatch = Readonly<{
	stop(): void;
}>;

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
		if (queued) {
			queueComputation(recomputeAndNotify, scope?.onError, currentWorkPriority(), scope);
			return;
		}
		queued = true;
		queueComputation(recomputeAndNotify, scope?.onError, currentWorkPriority(), scope);
	}

	function recomputeAndNotify(): void {
		// A computed value tears down and rebuilds its watcher on each flush so dependency
		// sets follow the latest branch of the compute function instead of stale reads.
		if (scope?.paused) {
			queueComputation(recomputeAndNotify, scope.onError, currentWorkPriority(), scope);
			return;
		}
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
	return watchRetained(fn, scheduler, options) ?? inactiveWatch;
}

/**
 * Runs a tracked function and returns ownership only when its execution observes dependencies.
 *
 * Framework bindings use the absence of a handle to avoid retaining inert DOM bookkeeping. A
 * watcher also retires if a later execution stops observing every dependency.
 */
export function watchRetained(
	fn: () => void,
	scheduler: (() => void) | undefined,
	options: RetainedWatchOptions & { owned: true }
): OwnedRetainedWatch | undefined;
export function watchRetained(
	fn: () => void,
	scheduler?: () => void,
	options?: RetainedWatchOptions
): StopHandle | undefined;
export function watchRetained(
	fn: () => void,
	scheduler?: () => void,
	options: RetainedWatchOptions = {}
): StopHandle | OwnedRetainedWatch | undefined {
	const scope = resolveObservationScope(options);
	const reaction = new RetainedReaction(fn, scheduler, options, scope);

	if (scope) registerEffectScopeReaction(scope, reaction);
	try {
		reaction.run();
	} catch (error) {
		// A caller cannot stop a watcher whose initial run failed before the stop
		// handle was returned. Tear it down here so dependencies and scope
		// ownership cannot leak.
		reaction.stop();
		throw error;
	}
	return reaction.active ? (options.owned ? reaction : () => reaction.stop()) : undefined;
}

/** Shared executor for retained watchers; instances store data rather than method closures. */
class RetainedReaction implements Reaction {
	active = true;
	scheduled = false;
	pendingPriority: Reaction['pendingPriority'];
	readonly deps = new Set<Dep>();

	constructor(
		private readonly fn: () => void,
		private readonly scheduler: (() => void) | undefined,
		options: RetainedWatchOptions,
		readonly scope: EffectScopeImpl | undefined
	) {
		this.onSchedule = options.onSchedule;
		this.onError = options.onError;
		this.onRelease = options.onRelease;
	}

	private readonly onSchedule: (() => void) | undefined;
	private readonly onError: ((error: unknown) => void) | undefined;
	private readonly onRelease: (() => void) | undefined;

	run(): void {
		if (!this.active) return;
		if (this.scope && !this.scope.active) {
			this.stop();
			return;
		}
		this.scheduled = false;
		this.pendingPriority = undefined;
		try {
			withEffectScope(this.scope, () => runTracked(this, this.fn));
			if (this.deps.size === 0) this.stop();
		} catch (error) {
			this.handleError(error);
		}
	}

	schedule(): void {
		if (!this.active) return;
		if (this.scope && !this.scope.active) {
			this.stop();
			return;
		}
		const priority = effectScopeWorkPriority(this.scope, currentWorkPriority());
		if (this.scheduled) {
			if (
				this.pendingPriority !== undefined &&
				isHigherWorkPriority(priority, this.pendingPriority)
			) {
				this.pendingPriority = priority;
				if (this.scheduler) this.scheduler();
				else queueReaction(this, priority);
			}
			return;
		}
		this.scheduled = true;
		this.pendingPriority = priority;
		try {
			if (this.onSchedule) withEffectScope(this.scope, this.onSchedule);
			if (this.scheduler) this.scheduler();
			else queueReaction(this);
		} catch (error) {
			// A failed scheduler did not arrange for run() to clear this bit. Reset it
			// so a later dependency change can retry rather than wedging the watcher.
			this.scheduled = false;
			this.pendingPriority = undefined;
			this.handleError(error);
		}
	}

	stop(): void {
		if (!this.active) return;
		this.active = false;
		this.scheduled = false;
		this.pendingPriority = undefined;
		cleanupReaction(this);
		if (this.scope) releaseEffectScopeReaction(this.scope, this);
		this.onRelease?.();
	}

	private handleError(error: unknown): void {
		const onError = this.onError ?? this.scope?.onError;
		if (!onError) throw error;
		onError(error);
	}
}

/** Subscribes directly to a reactive reference without running a dependency collection pass. */
export function subscribe<T>(
	source: ReactiveRef<T>,
	callback: () => void,
	options: WatchOptions = {}
): StopHandle {
	const scope = resolveObservationScope(options);
	const handleError = (error: unknown): void => {
		const onError = options.onError ?? scope?.onError;
		if (!onError) throw error;
		onError(error);
	};
	const dep = getDep(source.target, source.key);
	const reaction: Reaction = {
		active: true,
		scheduled: false,
		pendingPriority: undefined,
		deps: new Set([dep]),
		run() {
			reaction.scheduled = false;
			reaction.pendingPriority = undefined;
			if (!reaction.active || (scope && !scope.active)) {
				reaction.stop();
				return;
			}
			try {
				withEffectScope(scope, callback);
			} catch (error) {
				handleError(error);
			}
		},
		schedule() {
			if (!reaction.active || (scope && !scope.active)) {
				reaction.stop();
				return;
			}
			const priority = effectScopeWorkPriority(scope, currentWorkPriority());
			if (reaction.scheduled) {
				if (
					reaction.pendingPriority !== undefined &&
					isHigherWorkPriority(priority, reaction.pendingPriority)
				) {
					reaction.pendingPriority = priority;
					queueReaction(reaction, priority);
				}
				return;
			}
			reaction.scheduled = true;
			reaction.pendingPriority = priority;
			queueReaction(reaction, priority);
		},
		stop() {
			reaction.active = false;
			reaction.scheduled = false;
			reaction.pendingPriority = undefined;
			cleanupReaction(reaction);
			if (scope) releaseEffectScopeReaction(scope, reaction);
		}
	};

	dep.add(reaction);
	if (scope) registerEffectScopeReaction(scope, reaction);
	return reaction.stop;
}

/** Inherits ownership only when the caller did not explicitly capture an unowned scope. */
function resolveObservationScope(options: WatchOptions): EffectScopeImpl | undefined {
	return (
		Object.prototype.hasOwnProperty.call(options, 'scope') ? options.scope : currentEffectScope()
	) as EffectScopeImpl | undefined;
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

/** Returns the structural dependency source for a reactive iterable collection. */
export function collectionRef<T extends object>(value: T): ReactiveRef<T> | undefined {
	const existing = ref(value);
	if (existing) return existing;
	if (!isReactive(value)) return undefined;
	let source = collectionRefs.get(value) as ReactiveRef<T> | undefined;
	if (source) return source;
	const target = unwrap(value) as object;
	source = {
		target,
		key: iterateKey,
		get() {
			track(target, iterateKey);
			return value;
		},
		set() {
			throw new TypeError('Cannot replace a collection through its structural reference');
		}
	};
	collectionRefs.set(value, source as ReactiveRef<object>);
	return source;
}
