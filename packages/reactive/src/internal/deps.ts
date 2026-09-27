import {
	retainJournalOwnership,
	restoreJournalPredecessors,
	commitJournalOwnership,
	rollbackJournalOwnership
} from './journal-ownership.js';
import { scheduleDependencyReactions, scheduleTriggeredReactions } from './dependency-graph.js';

export {
	cleanupReaction,
	getDep,
	linkReaction,
	linkReactionToDependency,
	peek,
	reactionDependencies,
	registerDependencyObservationHooks,
	runTracked,
	track,
	type DependencyObservationHooks,
	type ReactiveDependency
} from './dependency-graph.js';

type Transaction = {
	readonly undos?: TransactionUndo[];
	readonly triggers: Map<object, Set<PropertyKey>>;
	readonly versionRanges?: Map<object, Map<PropertyKey, MutationVersionRange>>;
};

type MutationVersionRange = {
	start: number;
	end: number;
};

/** Ownership checks and invalidation accounting shared by composite inverse operations. */
export type MutationRestoration = {
	/** Allows restoration only when intervening writes belong to the rollback group. */
	allows(target: object, key: PropertyKey, baseline?: number): boolean;
	/** Records an actually restored dependency without publishing intermediate array shapes. */
	mark(target: object, key: PropertyKey): void;
};

type TransactionUndo = {
	readonly apply: (restoration: MutationRestoration) => void;
	readonly target?: object;
	readonly key?: PropertyKey;
};

const transactions: Transaction[] = [];
const mutationVersions = new WeakMap<object, Map<PropertyKey, number>>();
let restorationVersion = 0;

/** Retained inverse journal for one synchronously published group of reactive mutations. */
export type ReactiveMutationJournal = {
	/** Restores the values observed before the journaled mutations and publishes that restoration. */
	rollback(): void;
	/** Releases the inverse journal while retaining the published mutations. */
	discard(): void;
};

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

	const ownership = retainJournalOwnership(
		protectedVersions,
		transaction.versionRanges!,
		() => {
			const restored = rollbackTransaction(transaction, protectedVersions);
			restoreJournalPredecessors(ownership, restored, readMutationVersion);
			const parent = transactions[transactions.length - 1];
			if (parent) mergeTriggers(parent.triggers, transaction.triggers);
			else flushTriggers(transaction.triggers);
		},
		() => {
			transaction.undos!.length = 0;
			transaction.triggers.clear();
		}
	);
	let active = true;
	const journal: ReactiveMutationJournal = {
		rollback() {
			if (!active) return;
			active = false;
			publishBatch(() => rollbackJournalOwnership(ownership));
		},
		discard() {
			if (!active) return;
			active = false;
			commitJournalOwnership(ownership);
		}
	};
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
	publishBatch(() => {
		for (let index = journals.length - 1; index >= 0; index--) journals[index]!.rollback();
	});
}

/**
 * Records an inverse operation for the currently active transaction.
 *
 * Supplying the mutated target and dependency key lets a retained optimistic
 * journal preserve a newer authoritative write to that path during rollback.
 */
export function recordTransactionUndo(
	undo: (restoration: MutationRestoration) => void,
	target?: object,
	key?: PropertyKey
): void {
	transactions[transactions.length - 1]?.undos?.push({ apply: undo, target, key });
}

/** Returns whether mutations currently need an inverse journal entry. */
export function hasActiveTransaction(): boolean {
	return Boolean(transactions[transactions.length - 1]?.undos);
}

/** Returns whether target/key notifications are currently deferred by a reactive transaction. */
export function hasActiveReactiveTransaction(): boolean {
	return transactions.length > 0;
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
): Map<object, Set<PropertyKey>> {
	const restored = new Map<object, Set<PropertyKey>>();
	const undos = transaction.undos;
	if (!undos) return restored;
	const restoration: MutationRestoration = {
		allows: (target, key, baseline = 0) =>
			!protectedVersions ||
			readMutationVersion(target, key) === (protectedVersions.get(target)?.get(key) ?? baseline),
		mark: (target, key) => recordRestoredDependency(restored, target, key)
	};
	for (let index = undos.length - 1; index >= 0; index--) {
		const undo = undos[index]!;
		if (undo.target && undo.key !== undefined && !restoration.allows(undo.target, undo.key))
			continue;
		undo.apply(restoration);
		if (undo.target && undo.key !== undefined) restoration.mark(undo.target, undo.key);
	}
	advanceRestoredDependencyVersions(restored);
	return restored;
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

/** Returns the generation of the most recent transaction restoration. */
export function readReactiveRestorationVersion(): number {
	return restorationVersion;
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

function recordRestoredDependency(
	restored: Map<object, Set<PropertyKey>>,
	target: object,
	key: PropertyKey
): void {
	let keys = restored.get(target);
	if (!keys) restored.set(target, (keys = new Set()));
	keys.add(key);
}

function advanceRestoredDependencyVersions(restored: Map<object, Set<PropertyKey>>): void {
	if (!restored.size) return;
	for (const [target, keys] of restored)
		for (const key of keys) incrementMutationVersion(target, key);
	restorationVersion++;
}

function flushTriggers(triggers: Map<object, Set<PropertyKey>>): void {
	scheduleTriggeredReactions(triggers);
}

function triggerNow(target: object, key: PropertyKey): void {
	scheduleDependencyReactions(target, key);
}
