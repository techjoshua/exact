import type { Dep, Reaction } from './types.js';

const deps = new WeakMap<object, Map<PropertyKey, Dep>>();
const depObservationHooks = new WeakMap<object, Map<PropertyKey, DependencyObservationHooks>>();
const reactionStack: Reaction[] = [];
const trackingPauseFloors: number[] = [];
const pendingObservationTransitions: Array<() => void> = [];
let publishingObservationTransitions = false;

/** Identifies one target/key dependency without exposing its mutable subscriber set. */
export type ReactiveDependency = Readonly<{ target: object; key: PropertyKey }>;

/** Receives the first-observer and last-observer transitions for a dependency source. */
export type DependencyObservationHooks = Readonly<{
	onObserved(): void;
	onUnobserved(): void;
}>;

/** Records that the active reaction depends on a target/key pair. */
export function track(target: object, key: PropertyKey): boolean {
	const pauseFloor = trackingPauseFloors[trackingPauseFloors.length - 1];
	if (pauseFloor !== undefined && reactionStack.length <= pauseFloor) return false;
	const reaction = reactionStack[reactionStack.length - 1];
	if (!reaction) return false;
	linkReaction(reaction, target, key);
	return true;
}

/** Registers lifecycle hooks for the observer count of one dependency source. */
export function registerDependencyObservationHooks(
	target: object,
	key: PropertyKey,
	hooks: DependencyObservationHooks
): () => void {
	let targetHooks = depObservationHooks.get(target);
	if (!targetHooks) depObservationHooks.set(target, (targetHooks = new Map()));
	targetHooks.set(key, hooks);
	return () => {
		const current = depObservationHooks.get(target);
		if (current?.get(key) !== hooks) return;
		current.delete(key);
		if (!current.size) depObservationHooks.delete(target);
	};
}

/** Adds a reaction to one dependency while preserving observer-count transitions. */
export function linkReaction(reaction: Reaction, target: object, key: PropertyKey): void {
	linkReactionToDependency(reaction, getDep(target, key));
}

/** Adds a reaction to an existing dependency set while preserving observer-count transitions. */
export function linkReactionToDependency(reaction: Reaction, dep: Dep): void {
	const subscribers = dep.subscribers;
	if (subscribers === reaction || (subscribers instanceof Set && subscribers.has(reaction))) return;
	const wasEmpty = subscribers === undefined;
	dep.subscribers =
		subscribers === undefined
			? reaction
			: subscribers instanceof Set
				? subscribers.add(reaction)
				: new Set([subscribers, reaction]);
	reaction.deps.push(dep);
	if (wasEmpty)
		publishObservationTransition(depObservationHooks.get(dep.target)?.get(dep.key)?.onObserved);
}

/** Returns immutable target/key descriptors for a reaction's current dependencies. */
export function reactionDependencies(reaction: Reaction): ReactiveDependency[] {
	return reaction.deps;
}

/** Returns the dependency set for a target/key pair, creating it on first use. */
export function getDep(target: object, key: PropertyKey): Dep {
	let targetDeps = deps.get(target);
	if (!targetDeps) deps.set(target, (targetDeps = new Map()));
	let dep = targetDeps.get(key);
	if (!dep) {
		dep = { target, key };
		targetDeps.set(key, dep);
	}
	return dep;
}

/** Removes a reaction from all dependency sets it currently belongs to. */
export function cleanupReaction(reaction: Reaction): void {
	for (const dep of reaction.deps) {
		const subscribers = dep.subscribers;
		if (subscribers === reaction) dep.subscribers = undefined;
		else if (subscribers instanceof Set && subscribers.delete(reaction)) {
			if (subscribers.size === 1) dep.subscribers = subscribers.values().next().value;
			else if (subscribers.size === 0) dep.subscribers = undefined;
		} else continue;
		if (dep.subscribers === undefined) releaseEmptyDependency(dep);
	}
	reaction.deps.length = 0;
}

/** Schedules one stable snapshot of the reactions subscribed to a dependency. */
export function scheduleDependencyReactions(target: object, key: PropertyKey): void {
	const dep = deps.get(target)?.get(key);
	const subscribers = dep?.subscribers;
	if (subscribers instanceof Set) {
		for (const reaction of [...subscribers]) reaction.schedule();
	} else subscribers?.schedule();
}

/** Schedules subscribers for an atomic trigger collection through the coalescing scheduler. */
export function scheduleTriggeredReactions(triggers: Map<object, Set<PropertyKey>>): void {
	if (!triggers.size) return;
	for (const [target, keys] of triggers) {
		const targetDeps = deps.get(target);
		if (!targetDeps) continue;
		for (const key of keys) {
			const dep = targetDeps.get(key);
			const subscribers = dep?.subscribers;
			if (subscribers instanceof Set) {
				// Scheduling is deferred, so iterating the current dependency set cannot be
				// invalidated by a reaction running. Reaction.schedule() and queueReaction()
				// already coalesce repeated subscriptions across changed keys.
				for (const reaction of subscribers) reaction.schedule();
			} else subscribers?.schedule();
		}
	}
}

/** Runs a function while collecting all reactive reads into the supplied reaction. */
export function runTracked(reaction: Reaction, fn: () => void): void {
	cleanupReaction(reaction);
	reactionStack.push(reaction);
	try {
		fn();
	} finally {
		reactionStack.pop();
	}
}

/** Runs a function without linking its reads to the currently active reaction. */
export function peek<T>(fn: () => T): T {
	trackingPauseFloors.push(reactionStack.length);
	try {
		return fn();
	} finally {
		trackingPauseFloors.pop();
	}
}

function releaseEmptyDependency(dep: Dep): void {
	publishObservationTransition(depObservationHooks.get(dep.target)?.get(dep.key)?.onUnobserved);
	const targetDeps = deps.get(dep.target);
	if (targetDeps?.get(dep.key) === dep) targetDeps.delete(dep.key);
	if (targetDeps && !targetDeps.size) deps.delete(dep.target);
}

function publishObservationTransition(transition: (() => void) | undefined): void {
	if (!transition) return;
	pendingObservationTransitions.push(transition);
	if (publishingObservationTransitions) return;
	publishingObservationTransitions = true;
	try {
		while (pendingObservationTransitions.length) pendingObservationTransitions.pop()!();
	} finally {
		publishingObservationTransitions = false;
	}
}
