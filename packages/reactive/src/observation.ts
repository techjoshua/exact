import {
	cleanupReaction,
	getDep,
	linkReactionToDependency,
	runTracked,
	track
} from './internal/deps.js';

import {
	currentEffectScope,
	effectScopeWorkPriority,
	registerEffectScopeReaction,
	releaseEffectScopeReaction,
	withEffectScope
} from './internal/scopes.js';

import { currentWorkPriority, isHigherWorkPriority, queueReaction } from './internal/scheduler.js';

import { iterateKey, reactiveValueRef } from './internal/symbols.js';

import { isReactive, isReactiveValue, unwrap } from './internal/values.js';

import type {
	Dep,
	EffectScopeImpl,
	Reaction,
	ReactiveRef,
	ReactiveValue,
	StopHandle,
	WatchOptions
} from './internal/types.js';

import { proxyRefs } from './proxy/state.js';

const inactiveWatch: StopHandle = () => undefined;
const collectionRefs = new WeakMap<object, ReactiveRef<object>>();

/** Configures framework ownership notification for a watcher that may retire after execution. */
export type RetainedWatchOptions = WatchOptions & {
	/** Runs once when the watcher releases its dependencies and scope registration. */
	onRelease?(): void;
	/** Returns the shared reaction object for framework owners instead of allocating a handle. */
	owned?: boolean;
	/** Runs framework structural ownership before ordinary bindings at the same priority. */
	structural?: true;
};

/** Framework-owned retained reaction whose shared stop method avoids a per-binding handle closure. */
export type OwnedRetainedWatch = Readonly<{
	stop(): void;
}>;

export { computed } from './computation.js';

/** Runs a tracked function immediately and schedules it again whenever its dependencies change. */
export function watch(
	fn: () => void,
	scheduler?: () => void,
	options: WatchOptions = {}
): StopHandle {
	return watchRetained(fn, scheduler, options) ?? inactiveWatch;
}

/** Installs a framework-owned structural watcher ahead of ordinary bindings at equal priority. */
export function watchStructural(fn: () => void, options: WatchOptions = {}): StopHandle {
	return (
		(watchRetained(fn, undefined, { ...options, structural: true }) as StopHandle | undefined) ??
		inactiveWatch
	);
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
	readonly deps: Dep[] = [];
	readonly order: number;

	constructor(
		private readonly fn: () => void,
		private readonly scheduler: (() => void) | undefined,
		options: RetainedWatchOptions,
		readonly scope: EffectScopeImpl | undefined
	) {
		this.order = options.structural ? 0 : 1;
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
			if (this.deps.length === 0) this.stop();
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
	return subscribeToDependencies(new Set([getDep(source.target, source.key)]), callback, options);
}

/** Subscribes one coalesced reaction to compiler-selected keys on a shared target. */
export function subscribeKeys(
	target: object,
	keys: readonly PropertyKey[],
	callback: () => void,
	options: WatchOptions = {}
): StopHandle {
	const dependencies = new Set<Dep>();
	for (const key of keys) dependencies.add(getDep(target, key));
	if (dependencies.size === 0) return inactiveWatch;
	return subscribeToDependencies(dependencies, callback, options);
}

// One reaction belongs to every selected dep so a transaction schedules the callback exactly once.
function subscribeToDependencies(
	dependencies: Set<Dep>,
	callback: () => void,
	options: WatchOptions
): StopHandle {
	const scope = resolveObservationScope(options);
	const handleError = (error: unknown): void => {
		const onError = options.onError ?? scope?.onError;
		if (!onError) throw error;
		onError(error);
	};
	const reaction: Reaction = {
		active: true,
		scheduled: false,
		pendingPriority: undefined,
		deps: [],
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

	for (const dependency of dependencies) linkReactionToDependency(reaction, dependency);
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
	let source = collectionRefs.get(value) as ReactiveRef<T> | undefined;
	if (source) return source;
	if (!existing && !isReactive(value)) return undefined;
	const target = unwrap(value) as object;
	source = {
		target: existing?.target ?? target,
		key: existing?.key ?? iterateKey,
		get() {
			const current = existing ? existing.get() : value;
			trackCollectionStructure(current);
			return current;
		},
		set(next: T) {
			if (existing) {
				existing.set(next);
				return;
			}
			throw new TypeError('Cannot replace a collection through its structural reference');
		}
	};
	collectionRefs.set(value, source as ReactiveRef<object>);
	return source;
}

/** Records the structural dependency for a framework-owned collection consumer. */
export function trackCollectionStructure(value: object): void {
	track(unwrap(value) as object, iterateKey);
}
