import type { RestorationReceipt } from '../internal/transaction-restoration.js';
import { propertyDescriptor } from '../proxy/property-descriptors.js';
import { createPropertyUndo } from './property-undo.js';
import {
	batch,
	hasActiveTransaction,
	notifyReactiveDependency,
	readOwnershipVersion,
	readMutationVersion,
	recordTransactionCleanup,
	retainTransactionArray,
	recordTransactionUndo,
	trigger,
	type MutationRestoration
} from '../internal/deps.js';
import {
	arrayPosition,
	prepareArrayPositions,
	arrayPositionKey,
	arrayRestorationIndex,
	insertArrayPositions,
	removeArrayPositions,
	restoreArrayPosition,
	releaseArrayPositions,
	refuseArrayPositions,
	canRestoreClearedPositions,
	type ArrayPosition
} from './positions.js';
import { readArrayOrderVersion } from './reordering.js';
import { arrayLengthWriteKey, iterateKey } from '../internal/symbols.js';
import { markReactiveHashDirty } from '../internal/keyed-collections.js';
import type { ReactiveOptions } from '../internal/types.js';

/** Applies native sequence edits to normalized arguments, retaining entry identity across optimistic tasks. */
export function mutateArraySequence(
	target: unknown[],
	name: string,
	method: (this: unknown[], ...args: unknown[]) => unknown,
	args: unknown[],
	options: ReactiveOptions
): unknown {
	const oldLength = target.length;
	const { start, removed, inserted } = sequenceEdit(name, args, oldLength);
	// Establish ordering for original entries before any of them becomes a retained tombstone.
	retainTransactionArray(target);
	prepareArrayPositions(target);
	if (removed === inserted) {
		return replaceArraySegment(target, method, args, start, removed, options, name);
	}
	const journaled = hasActiveTransaction();
	const lengthVersion = readOwnershipVersion(target, arrayLengthWriteKey);
	const deleted = Array.from({ length: removed }, (_, offset) => {
		const index = start + offset;
		readOwnershipVersion(target, String(index));
		return {
			position: arrayPosition(target, index, true)!,
			descriptor: Reflect.getOwnPropertyDescriptor(target, String(index))
		};
	});
	const result = method.apply(target, args);
	if (removed) removeArrayPositions(target, start, removed);
	if (inserted && start < oldLength - removed) insertArrayPositions(target, start, inserted);
	const added = Array.from(
		{ length: inserted },
		(_, offset) => arrayPosition(target, start + offset, true)!
	);
	if (journaled) {
		const entries = [...deleted.map((entry) => entry.position), ...added];
		recordTransactionCleanup(() => releaseArrayPositions(entries));
		const cleared =
			start === 0 && removed === oldLength && inserted === 0
				? fullClearRestoration(target, deleted, lengthVersion)
				: undefined;
		for (const entry of deleted)
			recordTransactionUndo(
				(restoration) => {
					if (cleared?.used || entry.position.index >= 0) return false;
					const index = arrayRestorationIndex(entry.position);
					const beforeLength = target.length;
					const lengthReceipt = restoration.capture(target, 'length');
					if (restoration.allows(target, arrayLengthWriteKey, lengthVersion)) {
						Array.prototype.splice.call(target, index, 0, undefined);
						insertArrayPositions(target, index, 1);
						restoreArrayPosition(entry.position, index);
					} else {
						if (index >= target.length || Reflect.has(target, index)) return false;
						restoreArrayPosition(entry.position, index);
					}
					// Position attachment is complete here. Preserve a descriptor error over invalidation failure.
					let completed: boolean;
					try {
						completed = entry.descriptor
							? Reflect.defineProperty(target, String(index), entry.descriptor)
							: Reflect.deleteProperty(target, String(index));
					} catch (error) {
						try {
							notifyRestoration(target, index, beforeLength, restoration, lengthReceipt);
						} catch {
							/* The descriptor failure owns the exact primary. */
						}
						throw error;
					}
					notifyRestoration(target, index, beforeLength, restoration, lengthReceipt);
					return completed;
				},
				entry.position,
				arrayPositionKey
			);
		if (cleared) recordTransactionUndo(cleared.restore);
		for (const position of added)
			recordTransactionUndo(
				(restoration) => {
					if (position.index < 0) return false;
					const index = position.index;
					const beforeLength = target.length;
					const lengthReceipt = restoration.capture(target, 'length');
					if (restoration.allows(target, arrayLengthWriteKey, lengthVersion)) {
						Array.prototype.splice.call(target, index, 1);
						removeArrayPositions(target, index, 1);
					} else {
						const completed = Reflect.deleteProperty(target, String(index));
						notifyRestoration(target, index, beforeLength, restoration, lengthReceipt);
						return completed;
					}
					notifyRestoration(target, index, beforeLength, restoration, lengthReceipt);
					return true;
				},
				position,
				arrayPositionKey
			);
	}
	batch(() => {
		for (const entry of deleted) trigger(entry.position, arrayPositionKey);
		for (const position of added) trigger(position, arrayPositionKey);
		for (let index = start; index < Math.max(oldLength, target.length); index++)
			notifyReactiveDependency(target, String(index));
		if (oldLength !== target.length) trigger(target, 'length');
		if (removed || inserted) {
			markReactiveHashDirty(target);
			trigger(target, iterateKey);
		}
	});
	if (!journaled) releaseArrayPositions(deleted.map((entry) => entry.position));
	if (removed || inserted)
		try {
			options.onMutation?.(undefined, name);
		} catch {
			/* Inspection cannot change mutation behavior. */
		}
	return result;
}

/** Invalidates shifted numeric reads without claiming a new write to surviving entries. */
function notifyRestoration(
	target: unknown[],
	start: number,
	beforeLength: number,
	restoration: MutationRestoration,
	lengthReceipt: RestorationReceipt
): void {
	const end = Math.max(beforeLength, target.length);
	// Version invalidation also reaches retained pull dependencies without live observers.
	for (let index = start; index < end; index++) restoration.notify(target, String(index));
	if (beforeLength !== target.length) restoration.mark(lengthReceipt);

	restoration.notify(target, iterateKey);
}

function sequenceEdit(
	name: string,
	args: unknown[],
	length: number
): { start: number; removed: number; inserted: number } {
	if (name === 'push') return { start: length, removed: 0, inserted: args.length };
	if (name === 'unshift') return { start: 0, removed: 0, inserted: args.length };
	if (name === 'pop')
		return { start: Math.max(0, length - 1), removed: Math.min(1, length), inserted: 0 };
	if (name === 'shift') return { start: 0, removed: Math.min(1, length), inserted: 0 };
	const integer = (value: unknown) => Math.trunc(Number(value)) || 0;
	const offset = integer(args[0]);
	const start = offset < 0 ? Math.max(length + offset, 0) : Math.min(offset, length);
	const removed =
		args.length === 0
			? 0
			: args.length === 1
				? length - start
				: Math.min(Math.max(integer(args[1]), 0), length - start);
	return { start, removed, inserted: Math.max(0, args.length - 2) };
}

/** Equal-size replacements retain the same slot ownership as direct index assignments. */
function replaceArraySegment(
	target: unknown[],
	method: (this: unknown[], ...args: unknown[]) => unknown,
	args: unknown[],
	start: number,
	count: number,
	options: ReactiveOptions,
	name: string
): unknown {
	if (hasActiveTransaction())
		for (let index = start; index < start + count; index++)
			recordTransactionUndo(createPropertyUndo(target, String(index)), target, String(index));
	const result = method.apply(target, args);
	batch(() => {
		for (let index = start; index < start + count; index++) trigger(target, String(index));
		if (count) {
			markReactiveHashDirty(target);
			trigger(target, iterateKey);
		}
	});
	if (count)
		try {
			options.onMutation?.(undefined, name);
		} catch {
			/* Inspection cannot change mutation behavior. */
		}
	return result;
}

/** Keeps descriptor-sensitive or coercion-driven mutations on the snapshot restoration path.
 * Checks inherited slots and new destinations too, because native methods can partially fail there.
 */
export function supportsSequenceTracking(
	target: unknown[],
	name: string,
	args: unknown[]
): boolean {
	if (
		Object.getPrototypeOf(target) !== Array.prototype ||
		!Object.isExtensible(target) ||
		!Reflect.getOwnPropertyDescriptor(target, 'length')?.writable
	)
		return false;
	if (
		name === 'splice' &&
		!args
			.slice(0, 2)
			.every(
				(value) =>
					value === null || ['number', 'string', 'boolean', 'undefined'].includes(typeof value)
			)
	)
		return false;
	const edit = sequenceEdit(name, args, target.length);
	if (target.length - edit.removed + edit.inserted > 0xffff_ffff) return false;
	const nextLength = target.length - edit.removed + edit.inserted;
	for (let index = edit.start; index < Math.max(target.length, nextLength); index++) {
		const descriptor = propertyDescriptor(target, String(index));
		if (
			descriptor &&
			(!('value' in descriptor) || !descriptor.writable || !descriptor.configurable)
		)
			return false;
	}
	return true;
}

/** Restores only a completed full clear into its exact empty receiver, with local partial progress. */
function fullClearRestoration(
	target: unknown[],
	entries: readonly { position: ArrayPosition; descriptor: PropertyDescriptor | undefined }[],
	lengthVersion: number
): { used: boolean; restore(restoration: MutationRestoration): void } {
	const positions = entries.map((entry) => entry.position);
	const completed = new Set<number>();
	let attached = false;
	let disabled = false;
	let uncertain = false;
	const state = { used: false, restore };
	const signal = () => [
		readMutationVersion(target, iterateKey),
		readArrayOrderVersion(target),
		readMutationVersion(target, 'length'),
		readMutationVersion(target, arrayLengthWriteKey)
	];
	const unchanged = (before: number[]) => signal().every((value, index) => value === before[index]);
	const refuse = () => {
		uncertain = true;
		refuseArrayPositions(positions);
	};
	function apply(restoration: MutationRestoration, receipts: RestorationReceipt[]): void {
		if (!attached) {
			const before = signal();
			const admitted =
				target.length === 0 &&
				canRestoreClearedPositions(positions) &&
				restoration.allows(target, arrayLengthWriteKey, lengthVersion) &&
				positions.every((position) => restoration.allows(position, arrayPositionKey));
			if (!unchanged(before)) {
				state.used = true;
				refuse();
				return;
			}
			if (!admitted) {
				if (!state.used) disabled = true;
				return;
			}
			state.used = true;
			const lengthReceipt = restoration.capture(target, 'length');
			const extentSignal = signal();
			const accepted = Reflect.defineProperty(target, 'length', { value: entries.length });
			const length = target.length;
			if (!unchanged(extentSignal)) {
				refuse();
				return;
			}
			if (!accepted) {
				if (length !== 0) refuse();
				return;
			}
			if (length !== entries.length || !canRestoreClearedPositions(positions)) {
				refuse();
				return;
			}
			const holesSignal = signal();
			const vacant = entries.every(
				(_, index) => !Reflect.getOwnPropertyDescriptor(target, String(index))
			);
			if (!unchanged(holesSignal) || !vacant) {
				refuse();
				return;
			}
			positions.forEach((position, index) => restoreArrayPosition(position, index));
			attached = true;
			receipts.push(lengthReceipt);
		}
		for (let index = entries.length - 1; index >= 0; index--) {
			if (completed.has(index)) continue;
			const entry = entries[index]!;
			if (!restoration.allows(entry.position, arrayPositionKey)) continue;
			if (
				entry.position.index !== index ||
				arrayPosition(target, index, false) !== entry.position
			) {
				refuse();
				return;
			}
			const receipt = restoration.capture(entry.position, arrayPositionKey);
			const before = signal();
			let accepted: boolean;
			try {
				accepted = entry.descriptor
					? Reflect.defineProperty(target, String(index), entry.descriptor)
					: Reflect.getOwnPropertyDescriptor(target, String(index)) === undefined;
			} finally {
				if (!unchanged(before)) refuse();
			}
			if (uncertain) return;
			if (accepted && readOwnershipVersion(receipt.target, receipt.key) === receipt.expected) {
				completed.add(index);
				receipts.push(receipt);
			}
		}
	}
	function restore(restoration: MutationRestoration): void {
		if (disabled || uncertain) return;
		const receipts: RestorationReceipt[] = [];
		let failed = false;
		let primary: unknown;
		try {
			apply(restoration, receipts);
		} catch (error) {
			failed = true;
			primary = error;
			if (state.used && !attached) refuse();
		}
		try {
			if (!uncertain) for (const receipt of receipts) restoration.mark(receipt);
			if (state.used) {
				for (let index = 0; index < entries.length; index++)
					restoration.notify(target, String(index));
				restoration.notify(target, 'length');
				restoration.notify(target, iterateKey);
			}
		} catch (error) {
			if (!failed) {
				failed = true;
				primary = error;
			}
		}
		if (failed) throw primary;
	}
	return state;
}
