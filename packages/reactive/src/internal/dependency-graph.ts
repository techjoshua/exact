import type { Dep, Reaction } from './types.js';
import { sameDependencyKey } from './property-key.js';

type TargetDependencies = Dep | Map<PropertyKey, Dep>;

const deps = new WeakMap<object, TargetDependencies>();
const depObservationHooks = new WeakMap<object, Map<PropertyKey, DependencyObservationHooks>>();
const reactionStack: Reaction[] = [];

/** Owns old memberships until a rerun has collected its replacement dependency set. */
type TrackingPass = { reaction: Reaction; previous: Dep[]; seen: Dep | Set<Dep> | undefined };

/** Contains only synchronous reruns; popped passes cannot retain disposed reactions. */
const trackingPasses: TrackingPass[] = [];
const trackingPauseFloors: number[] = [];
const pendingObservationTransitions: Array<{
	hooks: DependencyObservationHooks;
	observed: boolean;
}> = [];
let publishingObservationTransitions = false;

/** Identifies one target/key dependency without exposing its mutable subscriber set. */
export type ReactiveDependency = Readonly<{ target: object; key: PropertyKey }>;

/** Receives synchronous observer transitions with the registered owner as the method receiver. */
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
): void {
	let targetHooks = depObservationHooks.get(target);
	if (!targetHooks) depObservationHooks.set(target, (targetHooks = new Map()));
	targetHooks.set(key, hooks);
}

/** Releases hooks only when they still belong to this owner, preserving replacement registrations. */
export function releaseDependencyObservationHooks(
	target: object,
	key: PropertyKey,
	hooks: DependencyObservationHooks
): void {
	const current = depObservationHooks.get(target);
	if (current?.get(key) !== hooks) return;
	current.delete(key);
	if (!current.size) depObservationHooks.delete(target);
}

/** Adds a reaction to one dependency while preserving observer-count transitions. */
export function linkReaction(reaction: Reaction, target: object, key: PropertyKey): void {
	linkReactionToDependency(reaction, getDep(target, key));
}

/** Adds a reaction to an existing dependency set while preserving observer-count transitions. */
export function linkReactionToDependency(reaction: Reaction, dep: Dep): void {
	const subscribers = dep.subscribers;
	const pass = trackingPasses[trackingPasses.length - 1];
	const collecting = pass?.reaction === reaction;
	if (subscribers === reaction || (subscribers instanceof Set && subscribers.has(reaction))) {
		if (collecting && !hasTrackedDependency(pass, dep)) {
			recordTrackedDependency(pass, dep);
			reaction.deps.push(dep);
		}
		return;
	}
	if (collecting) recordTrackedDependency(pass, dep);
	const wasEmpty = subscribers === undefined;
	dep.subscribers =
		subscribers === undefined
			? reaction
			: subscribers instanceof Set
				? subscribers.add(reaction)
				: new Set([subscribers, reaction]);
	reaction.deps.push(dep);
	if (wasEmpty)
		publishObservationTransition(depObservationHooks.get(dep.target)?.get(dep.key), true);
}

/** Keeps the common single-dependency pass free of membership-set allocation. */
function recordTrackedDependency(pass: TrackingPass, dep: Dep): void {
	if (pass.seen === undefined) pass.seen = dep;
	else if (pass.seen instanceof Set) pass.seen.add(dep);
	else if (pass.seen !== dep) pass.seen = new Set([pass.seen, dep]);
}

function hasTrackedDependency(pass: TrackingPass, dep: Dep): boolean {
	return pass.seen === dep || (pass.seen instanceof Set && pass.seen.has(dep));
}

/** Returns immutable target/key descriptors for a reaction's current dependencies. */
export function reactionDependencies(reaction: Reaction): ReactiveDependency[] {
	return reaction.deps;
}

/** Visits active observer keys without scanning receiver storage. Detached computations use version keys. */
export function reactiveDependencyKeys(target: object): Iterable<PropertyKey> {
	const entry = deps.get(target);
	return entry instanceof Map ? entry.keys() : entry ? [entry.key] : [];
}

/** Returns the dependency set for a target/key pair, creating it on first use. */
export function getDep(target: object, key: PropertyKey): Dep {
	const entry = deps.get(target);
	const previous = targetDependency(entry, key);
	if (previous) return previous;
	// Every observed dependency needs this mutable slot. Keep it inline on first attachment.
	const dep: Dep = { target, key, subscribers: undefined };
	if (!entry) deps.set(target, dep);
	else if (entry instanceof Map) entry.set(key, dep);
	else {
		const multiple = new Map<PropertyKey, Dep>();
		multiple.set(entry.key, entry);
		multiple.set(key, dep);
		deps.set(target, multiple);
	}
	return dep;
}

/** Removes a reaction from all dependency sets it currently belongs to. */
export function cleanupReaction(reaction: Reaction): void {
	for (const pass of trackingPasses)
		if (pass.reaction === reaction) {
			for (const dep of pass.previous) detachDependency(reaction, dep);
			pass.previous = [];
		}
	for (const dep of reaction.deps) detachDependency(reaction, dep);
	reaction.deps.length = 0;
}

/** Removes a single membership and publishes a real last-observer transition. */
function detachDependency(reaction: Reaction, dep: Dep): void {
	const subscribers = dep.subscribers;
	if (subscribers === reaction) dep.subscribers = undefined;
	else if (subscribers instanceof Set && subscribers.delete(reaction)) {
		if (subscribers.size === 1) dep.subscribers = subscribers.values().next().value;
		else if (subscribers.size === 0) dep.subscribers = undefined;
	} else return;
	if (dep.subscribers === undefined) releaseEmptyDependency(dep);
}

/** Schedules one stable snapshot of the reactions subscribed to a dependency. */
export function scheduleDependencyReactions(target: object, key: PropertyKey): void {
	const dep = targetDependency(deps.get(target), key);
	const subscribers = dep?.subscribers;
	if (subscribers instanceof Set) {
		for (const reaction of [...subscribers])
			if (observesDuringTracking(reaction, dep!)) reaction.schedule();
	} else if (subscribers && observesDuringTracking(subscribers, dep!)) subscribers.schedule();
}

/** Schedules subscribers for an atomic trigger collection through the coalescing scheduler. */
export function scheduleTriggeredReactions(triggers: Map<object, Set<PropertyKey>>): void {
	if (!triggers.size) return;
	let reactions: Reaction | Set<Reaction> | undefined;
	for (const [target, keys] of triggers) {
		const targetDeps = deps.get(target);
		if (!targetDeps) continue;
		for (const key of keys) {
			const dep = targetDependency(targetDeps, key);
			const subscribers = dep?.subscribers;
			if (subscribers instanceof Set) {
				for (const reaction of subscribers)
					if (observesDuringTracking(reaction, dep!))
						reactions = addScheduledReaction(reactions, reaction);
			} else if (subscribers && observesDuringTracking(subscribers, dep!))
				reactions = addScheduledReaction(reactions, subscribers);
		}
	}
	// A custom scheduler may run synchronously and replace its own watcher. Snapshotting every
	// affected reaction before scheduling prevents the replacement from joining this publication;
	// deduplication also preserves one atomic notification when several changed keys share it.
	if (reactions instanceof Set) for (const reaction of reactions) reaction.schedule();
	else reactions?.schedule();
}

/** Keeps empty and single-reaction publications allocation-free while deduplicating larger snapshots. */
function addScheduledReaction(
	previous: Reaction | Set<Reaction> | undefined,
	reaction: Reaction
): Reaction | Set<Reaction> {
	if (!previous || previous === reaction) return reaction;
	if (previous instanceof Set) return previous.add(reaction);
	return new Set<Reaction>().add(previous).add(reaction);
}

/** Old memberships remain retained until exit but cannot invalidate an unread branch during execution. */
function observesDuringTracking(reaction: Reaction, dep: Dep): boolean {
	for (let i = trackingPasses.length - 1; i >= 0; i--) {
		const pass = trackingPasses[i]!;
		if (pass.reaction === reaction) return hasTrackedDependency(pass, dep);
	}
	return true;
}

/**
 * Collects replacement dependencies without tearing down memberships that the reaction rereads.
 * Old memberships are ineligible to notify this execution until read again. Unused memberships
 * are released on exit, including exceptional exits; disposal also releases reads made afterward.
 */
export function runTracked(reaction: Reaction, fn: () => void): void {
	// Static executions need no membership index; allocate it on the first observed read.
	const pass: TrackingPass = { reaction, previous: reaction.deps, seen: undefined };
	reaction.deps = [];
	trackingPasses.push(pass);
	reactionStack.push(reaction);
	try {
		fn();
	} finally {
		reactionStack.pop();
		trackingPasses.pop();
		for (const dep of pass.previous)
			if (!hasTrackedDependency(pass, dep)) detachDependency(reaction, dep);
		// Disposal can occur inside fn(), followed by additional reads before it returns.
		if (!reaction.active) cleanupReaction(reaction);
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
	publishObservationTransition(depObservationHooks.get(dep.target)?.get(dep.key), false);
	// The transition can synchronously attach a replacement observer to this same identity.
	if (dep.subscribers !== undefined) return;
	const entry = deps.get(dep.target);
	if (entry === dep) deps.delete(dep.target);
	else if (entry instanceof Map && entry.get(dep.key) === dep) {
		entry.delete(dep.key);
		if (!entry.size) deps.delete(dep.target);
	}
}

function publishObservationTransition(
	hooks: DependencyObservationHooks | undefined,
	observed: boolean
): void {
	if (!hooks) return;
	pendingObservationTransitions.push({ hooks, observed });
	if (publishingObservationTransitions) return;
	publishingObservationTransitions = true;
	try {
		while (pendingObservationTransitions.length) {
			const transition = pendingObservationTransitions.pop()!;
			if (transition.observed) transition.hooks.onObserved();
			else transition.hooks.onUnobserved();
		}
	} finally {
		publishingObservationTransitions = false;
	}
}

/** Reads the compact single-key target or its promoted dependency index without allocating. */
function targetDependency(
	entry: TargetDependencies | undefined,
	key: PropertyKey
): Dep | undefined {
	return entry instanceof Map
		? entry.get(key)
		: entry && sameDependencyKey(entry.key, key)
			? entry
			: undefined;
}
