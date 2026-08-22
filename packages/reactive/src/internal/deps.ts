import type { Dep, Reaction } from './types.js';

const deps = new WeakMap<object, Map<PropertyKey, Dep>>();
const depOwners = new WeakMap<Dep, { target: object; key: PropertyKey }>();
const reactionStack: Reaction[] = [];
const trackingPauseFloors: number[] = [];

type Transaction = {
	readonly undos?: TransactionUndo[];
	readonly triggers: Map<object, Set<PropertyKey>>;
	readonly versionRanges?: Map<object, Map<PropertyKey, MutationVersionRange>>;
};

type MutationVersionRange = {
	start: number;
	end: number;
};

type TransactionUndo = {
	readonly apply: () => void;
	readonly target?: object;
	readonly key?: PropertyKey;
};

const transactions: Transaction[] = [];
const mutationVersions = new WeakMap<object, Map<PropertyKey, number>>();
const journalTransactions = new WeakMap<ReactiveMutationJournal, Transaction>();

/** Retained inverse journal for one synchronously published group of reactive mutations. */
export type ReactiveMutationJournal = {
	/** Restores the values observed before the journaled mutations and publishes that restoration. */
	rollback(): void;
	/** Releases the inverse journal while retaining the published mutations. */
	discard(): void;
};

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
	const previousVersion = readMutationVersion(target, key);
	const nextVersion = incrementMutationVersion(target, key);
	const transaction = transactions[transactions.length - 1];
	if (transaction) {
		let keys = transaction.triggers.get(target);
		if (!keys) {
			keys = new Set();
			transaction.triggers.set(target, keys);
		}
		keys.add(key);
		if (transaction.versionRanges)
			recordMutationVersionRange(
				transaction.versionRanges,
				target,
				key,
				previousVersion,
				nextVersion
			);
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
	const parent = transactions[transactions.length - 1];
	const transaction = createTransaction(true, Boolean(parent?.versionRanges));
	transactions.push(transaction);
	let result: T;
	try {
		result = fn();
	} catch (error) {
		transactions.pop();
		rollbackTransaction(transaction);
		throw error;
	}
	transactions.pop();
	publishTransaction(parent, transaction);
	return result;
}

/**
 * Publishes one framework-owned synchronous update group without retaining inverse mutations.
 *
 * Native compiled event handlers use this lane because ordinary event mutations remain published
 * when a later statement throws. A surrounding rollback-capable transaction upgrades the lane so
 * its complete atomic contract is preserved when framework operations are nested.
 *
 * @internal
 */
export function publishBatch<T>(fn: () => T): T {
	const parent = transactions[transactions.length - 1];
	const transaction = createTransaction(Boolean(parent?.undos), Boolean(parent?.versionRanges));
	transactions.push(transaction);
	let result: T;
	try {
		result = fn();
	} catch (error) {
		transactions.pop();
		publishTransaction(parent, transaction);
		throw error;
	}
	transactions.pop();
	publishTransaction(parent, transaction);
	return result;
}

/**
 * Publishes synchronous mutations while retaining a single-use inverse journal.
 *
 * This is a framework primitive for optimistic state. The callback must not return asynchronous
 * work: only mutations performed before it returns belong to the journal. A journal nested in a
 * batch contributes its notifications to that batch but retains independent rollback ownership.
 */
export function captureReactiveMutations(fn: () => void): ReactiveMutationJournal {
	const transaction = createTransaction(true, true);
	transactions.push(transaction);
	try {
		fn();
	} catch (error) {
		transactions.pop();
		rollbackTransaction(transaction);
		throw error;
	}
	transactions.pop();
	const parent = transactions[transactions.length - 1];
	if (parent) mergeTriggers(parent.triggers, transaction.triggers);
	else flushTriggers(transaction.triggers);
	const protectedVersions = transactionMutationVersions(transaction.versionRanges!);

	let active = true;
	const journal: ReactiveMutationJournal = {
		rollback() {
			if (!active) return;
			active = false;
			rollbackTransaction(transaction, protectedVersions);
			const parent = transactions[transactions.length - 1];
			if (parent) mergeTriggers(parent.triggers, transaction.triggers);
			else flushTriggers(transaction.triggers);
			transaction.undos!.length = 0;
			transaction.triggers.clear();
		},
		discard() {
			if (!active) return;
			active = false;
			transaction.undos!.length = 0;
			transaction.triggers.clear();
		}
	};
	journalTransactions.set(journal, transaction);
	return journal;
}

/**
 * Rolls back several journals as one ownership stack.
 *
 * Version ranges produced by newer journals are transparent to older journals. Any missing
 * version in that range represents an authoritative mutation and blocks older restoration for
 * that path.
 */
export function rollbackReactiveMutationJournals(
	journals: readonly ReactiveMutationJournal[]
): void {
	const covered = new Map<object, Map<PropertyKey, MutationVersionRange[]>>();
	const blocked = new Map<object, Set<PropertyKey>>();
	const rollbackTriggers = new Map<object, Set<PropertyKey>>();
	for (let journalIndex = journals.length - 1; journalIndex >= 0; journalIndex--) {
		const journal = journals[journalIndex]!;
		const transaction = journalTransactions.get(journal);
		if (!transaction) {
			journal.rollback();
			continue;
		}
		rollbackOwnedTransaction(transaction, covered, blocked);
		addCoveredVersionRanges(covered, transaction.versionRanges!);
		mergeTriggers(rollbackTriggers, transaction.triggers);
		journal.discard();
	}
	const parent = transactions[transactions.length - 1];
	if (parent) mergeTriggers(parent.triggers, rollbackTriggers);
	else flushTriggers(rollbackTriggers);
}

/**
 * Records an inverse operation for the currently active transaction.
 *
 * Supplying the mutated target and dependency key lets a retained optimistic
 * journal preserve a newer authoritative write to that path during rollback.
 */
export function recordTransactionUndo(undo: () => void, target?: object, key?: PropertyKey): void {
	transactions[transactions.length - 1]?.undos?.push({ apply: undo, target, key });
}

/** Returns whether mutations currently need an inverse journal entry. */
export function hasActiveTransaction(): boolean {
	return Boolean(transactions[transactions.length - 1]?.undos);
}

function mergeTransaction(parent: Transaction, child: Transaction): void {
	if (parent.undos && child.undos) parent.undos.push(...child.undos);
	mergeTriggers(parent.triggers, child.triggers);
	if (parent.versionRanges && child.versionRanges)
		mergeVersionRanges(parent.versionRanges, child.versionRanges);
}

function publishTransaction(parent: Transaction | undefined, transaction: Transaction): void {
	if (parent) mergeTransaction(parent, transaction);
	else flushTriggers(transaction.triggers);
}

function mergeTriggers(
	parent: Map<object, Set<PropertyKey>>,
	child: Map<object, Set<PropertyKey>>
): void {
	for (const [target, keys] of child) {
		let pending = parent.get(target);
		if (!pending) {
			pending = new Set();
			parent.set(target, pending);
		}
		for (const key of keys) pending.add(key);
	}
}

function rollbackTransaction(
	transaction: Transaction,
	protectedVersions?: Map<object, Map<PropertyKey, number>>
): void {
	const undos = transaction.undos;
	if (!undos) return;
	for (let index = undos.length - 1; index >= 0; index--) {
		const undo = undos[index]!;
		if (
			protectedVersions &&
			undo.target &&
			undo.key !== undefined &&
			readMutationVersion(undo.target, undo.key) !==
				protectedVersions.get(undo.target)?.get(undo.key)
		)
			continue;
		undo.apply();
	}
}

function transactionMutationVersions(
	versionRanges: Map<object, Map<PropertyKey, MutationVersionRange>>
): Map<object, Map<PropertyKey, number>> {
	const result = new Map<object, Map<PropertyKey, number>>();
	for (const [target, ranges] of versionRanges) {
		const versions = new Map<PropertyKey, number>();
		for (const [key, range] of ranges) versions.set(key, range.end);
		result.set(target, versions);
	}
	return result;
}

function incrementMutationVersion(target: object, key: PropertyKey): number {
	let versions = mutationVersions.get(target);
	if (!versions) mutationVersions.set(target, (versions = new Map()));
	const next = (versions.get(key) ?? 0) + 1;
	versions.set(key, next);
	return next;
}

/** Returns the current mutation generation for one dependency without tracking it. */
export function readMutationVersion(target: object, key: PropertyKey): number {
	return mutationVersions.get(target)?.get(key) ?? 0;
}

function createTransaction(rollback: boolean, retainVersions = false): Transaction {
	return {
		...(rollback ? { undos: [] } : {}),
		triggers: new Map(),
		...(retainVersions ? { versionRanges: new Map() } : {})
	};
}

function recordMutationVersionRange(
	versionRanges: Map<object, Map<PropertyKey, MutationVersionRange>>,
	target: object,
	key: PropertyKey,
	start: number,
	end: number
): void {
	let ranges = versionRanges.get(target);
	if (!ranges) versionRanges.set(target, (ranges = new Map()));
	const range = ranges.get(key);
	if (range) range.end = end;
	else ranges.set(key, { start, end });
}

function mergeVersionRanges(
	parent: Map<object, Map<PropertyKey, MutationVersionRange>>,
	child: Map<object, Map<PropertyKey, MutationVersionRange>>
): void {
	for (const [target, childRanges] of child) {
		let ranges = parent.get(target);
		if (!ranges) parent.set(target, (ranges = new Map()));
		for (const [key, childRange] of childRanges) {
			const range = ranges.get(key);
			if (range) range.end = childRange.end;
			else ranges.set(key, { ...childRange });
		}
	}
}

function rollbackOwnedTransaction(
	transaction: Transaction,
	covered: Map<object, Map<PropertyKey, MutationVersionRange[]>>,
	blocked: Map<object, Set<PropertyKey>>
): void {
	const undos = transaction.undos;
	if (!undos || !transaction.versionRanges) return;
	for (let index = undos.length - 1; index >= 0; index--) {
		const undo = undos[index]!;
		if (undo.target && undo.key !== undefined) {
			if (blocked.get(undo.target)?.has(undo.key)) continue;
			const range = transaction.versionRanges.get(undo.target)?.get(undo.key);
			if (
				range &&
				!versionsCovered(
					range.end + 1,
					readMutationVersion(undo.target, undo.key),
					covered.get(undo.target)?.get(undo.key) ?? []
				)
			) {
				let keys = blocked.get(undo.target);
				if (!keys) blocked.set(undo.target, (keys = new Set()));
				keys.add(undo.key);
				continue;
			}
		}
		undo.apply();
	}
}

function versionsCovered(
	start: number,
	end: number,
	ranges: readonly MutationVersionRange[]
): boolean {
	if (start > end) return true;
	let next = start;
	for (const range of [...ranges].sort((left, right) => left.start - right.start)) {
		const ownedStart = range.start + 1;
		if (ownedStart > next) return false;
		if (range.end >= next) next = range.end + 1;
		if (next > end) return true;
	}
	return false;
}

function addCoveredVersionRanges(
	covered: Map<object, Map<PropertyKey, MutationVersionRange[]>>,
	additions: Map<object, Map<PropertyKey, MutationVersionRange>>
): void {
	for (const [target, addedRanges] of additions) {
		let ranges = covered.get(target);
		if (!ranges) covered.set(target, (ranges = new Map()));
		for (const [key, range] of addedRanges) {
			const values = ranges.get(key) ?? [];
			values.push(range);
			ranges.set(key, values);
		}
	}
}

function flushTriggers(triggers: Map<object, Set<PropertyKey>>): void {
	if (!triggers.size) return;
	const reactions = new Set<Reaction>();
	for (const [target, keys] of triggers) {
		const targetDeps = deps.get(target);
		if (!targetDeps) continue;
		for (const key of keys) {
			const dep = targetDeps.get(key);
			if (!dep) continue;
			for (const reaction of dep) reactions.add(reaction);
		}
	}

	// Custom schedulers may synchronously replace their watcher. Snapshot the complete
	// subscriber set first so the replacement cannot be rediscovered by a later key in
	// the same atomic transition.
	for (const reaction of reactions) reaction.schedule();
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
