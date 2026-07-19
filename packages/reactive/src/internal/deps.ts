import type { Dep, Reaction } from './types.js';

const deps = new WeakMap<object, Map<PropertyKey, Dep>>();
const depOwners = new WeakMap<Dep, { target: object; key: PropertyKey }>();
const reactionStack: Reaction[] = [];
const trackingPauseFloors: number[] = [];

type Transaction = {
	readonly undos: Array<() => void>;
	readonly triggers: Map<object, Set<PropertyKey>>;
};

const transactions: Transaction[] = [];

/** Records that the active reaction depends on a target/key pair. */
export function track(target: object, key: PropertyKey): void {
	const pauseFloor = trackingPauseFloors[trackingPauseFloors.length - 1];
	// Reactions that existed when peek() began stay hidden, but a reaction
	// explicitly created inside peek() owns its own dependency collection.
	if (pauseFloor !== undefined && reactionStack.length <= pauseFloor) return;
	const reaction = reactionStack[reactionStack.length - 1];
	if (!reaction) return;

	const dep = getDep(target, key);
	dep.add(reaction);
	reaction.deps.add(dep);
}

/** Schedules every reaction currently subscribed to a target/key pair. */
export function trigger(target: object, key: PropertyKey): void {
	const transaction = transactions[transactions.length - 1];
	if (transaction) {
		let keys = transaction.triggers.get(target);
		if (!keys) {
			keys = new Set();
			transaction.triggers.set(target, keys);
		}
		keys.add(key);
		return;
	}
	triggerNow(target, key);
}

/**
 * Runs a group of writes as one atomic observable state transition.
 * Reactive mutations are rolled back when the callback throws.
 * The transaction covers synchronous callback execution only. If the callback
 * returns a promise, synchronous writes are committed before that promise
 * settles; use separate batches after awaits.
 */
export function batch<T>(fn: () => T): T {
	const transaction: Transaction = { undos: [], triggers: new Map() };
	transactions.push(transaction);
	let result: T;
	try {
		result = fn();
	} catch (error) {
		transactions.pop();
		for (let index = transaction.undos.length - 1; index >= 0; index--) transaction.undos[index]!();
		throw error;
	}
	transactions.pop();
	const parent = transactions[transactions.length - 1];
	if (parent) mergeTransaction(parent, transaction);
	else flushTriggers(transaction.triggers);
	return result;
}

/** Records an inverse operation for the currently active transaction. */
export function recordTransactionUndo(undo: () => void): void {
	transactions[transactions.length - 1]?.undos.push(undo);
}

/** Returns whether mutations currently need an inverse journal entry. */
export function hasActiveTransaction(): boolean {
	return transactions.length > 0;
}

function mergeTransaction(parent: Transaction, child: Transaction): void {
	parent.undos.push(...child.undos);
	for (const [target, keys] of child.triggers) {
		let pending = parent.triggers.get(target);
		if (!pending) {
			pending = new Set();
			parent.triggers.set(target, pending);
		}
		for (const key of keys) pending.add(key);
	}
}

function flushTriggers(triggers: Map<object, Set<PropertyKey>>): void {
	if (!triggers.size) return;
	const pending = [...triggers];
	for (const [target, keys] of pending) for (const key of keys) triggerNow(target, key);
}

function triggerNow(target: object, key: PropertyKey): void {
	const dep = deps.get(target)?.get(key);
	if (!dep) return;
	for (const reaction of [...dep]) {
		reaction.schedule();
	}
}

/** Returns the dependency set for a target/key pair, creating it on first use. */
export function getDep(target: object, key: PropertyKey): Dep {
	let targetDeps = deps.get(target);
	if (!targetDeps) {
		targetDeps = new Map();
		deps.set(target, targetDeps);
	}

	let dep = targetDeps.get(key);
	if (!dep) {
		dep = new Set();
		targetDeps.set(key, dep);
		depOwners.set(dep, { target, key });
	}

	return dep;
}

/** Removes a reaction from all dependency sets it currently belongs to. */
export function cleanupReaction(reaction: Reaction): void {
	for (const dep of reaction.deps) {
		dep.delete(reaction);
		if (!dep.size) {
			const owner = depOwners.get(dep);
			if (owner) {
				const targetDeps = deps.get(owner.target);
				if (targetDeps?.get(owner.key) === dep) targetDeps.delete(owner.key);
				if (targetDeps && !targetDeps.size) deps.delete(owner.target);
				depOwners.delete(dep);
			}
		}
	}
	reaction.deps.clear();
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
