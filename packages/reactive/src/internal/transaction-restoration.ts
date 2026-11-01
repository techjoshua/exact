import { isArrayPosition, isUsableArrayPosition } from '../arrays/positions.js';
import { markReactiveHashDirty } from './keyed-collections.js';
import type { JournalVersions } from './journal-ownership.js';

/** Binds one completed inverse effect to authority captured before authored code runs. */
export type RestorationReceipt = {
	readonly target: object;
	readonly key: PropertyKey;
	readonly expected: number;
};

/** Ownership checks and observation invalidation for one inverse operation. */
export type MutationRestoration = {
	allows(target: object, key: PropertyKey, baseline?: number): boolean;
	capture(target: object, key: PropertyKey): RestorationReceipt;
	mark(receipt: RestorationReceipt): void;
	notify(target: object, key: PropertyKey): void;
};

/** A targeted inverse reports actual completion. Composite inverses mark each completed effect. */
export type TransactionUndo = {
	readonly apply: (restoration: MutationRestoration, location?: object) => boolean | void;
	readonly target?: object;
	readonly key?: PropertyKey;
};

/** Physical failure is separate from publication and release failures, including thrown undefined. */
export type RestorationOutcome = {
	readonly restored: Map<object, Set<PropertyKey>>;
	readonly restorationFailed: boolean;
	readonly restorationError: unknown;
};

/** Supplies the existing transaction owner's version and notification stores to its single walker. */
export type RestorationAccess = {
	locate(target: object, key: PropertyKey): { target: object; key: PropertyKey };
	read(target: object, key: PropertyKey): number;
	notify(target: object, key: PropertyKey): void;
	finish(restored: Map<object, Set<PropertyKey>>): void;
};

/** Restores until the first physical failure, then validates completed receipts without retrying. */
export function restoreTransaction(
	undos: readonly TransactionUndo[] | undefined,
	triggers: ReadonlyMap<object, ReadonlySet<PropertyKey>>,
	protectedVersions: JournalVersions | undefined,
	access: RestorationAccess
): RestorationOutcome {
	const receipts = new Map<object, Map<PropertyKey, number>>();
	const restored = new Map<object, Set<PropertyKey>>();
	const capture = (target: object, key: PropertyKey): RestorationReceipt => {
		const address = access.locate(target, key);
		return { ...address, expected: access.read(address.target, address.key) };
	};
	const usable = (target: object) => !isArrayPosition(target) || isUsableArrayPosition(target);
	const current = (receipt: RestorationReceipt) =>
		usable(receipt.target) && access.read(receipt.target, receipt.key) === receipt.expected;
	const restoration: MutationRestoration = {
		allows(target, key, baseline = 0) {
			const address = access.locate(target, key);
			return (
				usable(address.target) &&
				(!protectedVersions ||
					access.read(address.target, address.key) ===
						(protectedVersions.get(address.target)?.get(address.key) ?? baseline))
			);
		},
		capture,
		mark(receipt) {
			if (!current(receipt)) return;
			let keys = receipts.get(receipt.target);
			if (!keys) receipts.set(receipt.target, (keys = new Map()));
			keys.set(receipt.key, receipt.expected);
			if (isArrayPosition(receipt.target)) {
				if (receipt.target.index >= 0)
					access.notify(receipt.target.array, String(receipt.target.index));
			} else access.notify(receipt.target, receipt.key);
		},
		notify: access.notify
	};
	let restorationFailed = false;
	let restorationError: unknown;
	try {
		for (let index = (undos?.length ?? 0) - 1; index >= 0; index--) {
			const undo = undos![index]!;
			const targeted = undo.target !== undefined && undo.key !== undefined;
			if (targeted && !restoration.allows(undo.target!, undo.key!)) continue;
			// The stored dependency address can differ from the receiver's physical property key.
			const receipt = targeted ? capture(undo.target!, undo.key!) : undefined;
			const completed = undo.apply(restoration, undo.target);
			if (receipt && completed === true) restoration.mark(receipt);
		}
	} catch (error) {
		restorationFailed = true;
		restorationError = error;
	}
	// A later inverse or authored trap may supersede an earlier successful effect.
	for (const [target, keys] of receipts) {
		for (const [key, expected] of keys) {
			if (!usable(target) || access.read(target, key) !== expected) continue;
			let valid = restored.get(target);
			if (!valid) restored.set(target, (valid = new Set()));
			valid.add(key);
		}
	}
	// No authored callback separates final validation from ownership reset.
	access.finish(restored);
	for (const target of triggers.keys()) markReactiveHashDirty(target);
	return { restored, restorationFailed, restorationError };
}

/** Consumes owned cleanup entries before callbacks and preserves the first exact cleanup error. */
export function releaseTransaction(transaction: { cleanups?: Array<() => void> }): void {
	let failed = false;
	let primary: unknown;
	while (transaction.cleanups?.length) {
		const cleanup = transaction.cleanups.pop()!;
		try {
			cleanup();
		} catch (error) {
			if (!failed) {
				failed = true;
				primary = error;
			}
		}
	}
	if (failed) throw primary;
}
