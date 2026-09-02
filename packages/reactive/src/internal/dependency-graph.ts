import type { Dep, Reaction } from './types.js';

const deps = new WeakMap<object, Map<PropertyKey, Dep>>();
const depOwners = new WeakMap<Dep, ReactiveDependency>();
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
	if (dep.has(reaction)) return;
	const wasEmpty = dep.size === 0;
	dep.add(reaction);
	reaction.deps.push(dep);
	const owner = depOwners.get(dep);
	if (wasEmpty && owner)
		publishObservationTransition(depObservationHooks.get(owner.target)?.get(owner.key)?.onObserved);
}

/** Returns immutable target/key descriptors for a reaction's current dependencies. */
export function reactionDependencies(reaction: Reaction): ReactiveDependency[] {
	const result: ReactiveDependency[] = [];
	for (const dep of reaction.deps) {
		const owner = depOwners.get(dep);
		if (owner) result.push(owner);
	}
	return result;
}

/** Returns the dependency set for a target/key pair, creating it on first use. */
export function getDep(target: object, key: PropertyKey): Dep {
	let targetDeps = deps.get(target);
	if (!targetDeps) deps.set(target, (targetDeps = new Map()));
	let dep = targetDeps.get(key);
	if (!dep) {
		targetDeps.set(key, (dep = new Set()));
		depOwners.set(dep, { target, key });
	}
	return dep;
}

/** Removes a reaction from all dependency sets it currently belongs to. */
export function cleanupReaction(reaction: Reaction): void {
	for (const dep of reaction.deps) {
		if (!dep.delete(reaction)) continue;
		if (!dep.size) releaseEmptyDependency(dep);
	}
	reaction.deps.length = 0;
}

/** Schedules one stable snapshot of the reactions subscribed to a dependency. */
export function scheduleDependencyReactions(target: object, key: PropertyKey): void {
	const dep = deps.get(target)?.get(key);
	if (dep) for (const reaction of [...dep]) reaction.schedule();
}

/** Schedules one deduplicated subscriber snapshot for an atomic trigger collection. */
export function scheduleTriggeredReactions(triggers: Map<object, Set<PropertyKey>>): void {
	if (!triggers.size) return;
	const reactions = new Set<Reaction>();
	for (const [target, keys] of triggers) {
		const targetDeps = deps.get(target);
		if (!targetDeps) continue;
		for (const key of keys) {
			const dep = targetDeps.get(key);
			if (dep) for (const reaction of dep) reactions.add(reaction);
		}
	}
	for (const reaction of reactions) reaction.schedule();
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
	const owner = depOwners.get(dep);
	if (!owner) return;
	publishObservationTransition(depObservationHooks.get(owner.target)?.get(owner.key)?.onUnobserved);
	const targetDeps = deps.get(owner.target);
	if (targetDeps?.get(owner.key) === dep) targetDeps.delete(owner.key);
	if (targetDeps && !targetDeps.size) deps.delete(owner.target);
	depOwners.delete(dep);
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
