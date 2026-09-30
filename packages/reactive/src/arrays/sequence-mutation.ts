import { createPropertyUndo } from './property-undo.js';
import {
	batch,
	hasActiveTransaction,
	notifyReactiveDependency,
	readOwnershipVersion,
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
	releaseArrayPositions
} from './positions.js';
import { arrayLengthWriteKey, iterateKey } from '../internal/symbols.js';
import { markReactiveHashDirty } from '../internal/keyed-collections.js';
import { unwrap } from '../internal/values.js';
import type { ReactiveOptions } from '../internal/types.js';

/** Applies native sequence edits with entry identity retained across overlapping optimistic tasks. */
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
	const result = method.apply(
		target,
		args.map((value) => unwrap(value))
	);
	if (removed) removeArrayPositions(target, start, removed);
	if (inserted && start < oldLength - removed) insertArrayPositions(target, start, inserted);
	const added = Array.from(
		{ length: inserted },
		(_, offset) => arrayPosition(target, start + offset, true)!
	);
	if (journaled) {
		const entries = [...deleted.map((entry) => entry.position), ...added];
		recordTransactionCleanup(() => releaseArrayPositions(entries));
		for (const entry of deleted)
			recordTransactionUndo(
				(restoration) => {
					if (entry.position.index >= 0) return;
					const index = arrayRestorationIndex(entry.position);
					const beforeLength = target.length;
					if (restoration.allows(target, arrayLengthWriteKey, lengthVersion)) {
						Array.prototype.splice.call(target, index, 0, undefined);
						insertArrayPositions(target, index, 1);
						restoreArrayPosition(entry.position, index);
					} else {
						if (index >= target.length || Reflect.has(target, index)) return;
						restoreArrayPosition(entry.position, index);
					}
					if (entry.descriptor) Reflect.defineProperty(target, String(index), entry.descriptor);
					else Reflect.deleteProperty(target, String(index));
					notifyRestoration(target, index, beforeLength, restoration);
				},
				entry.position,
				arrayPositionKey
			);
		for (const position of added)
			recordTransactionUndo(
				(restoration) => {
					if (position.index < 0) return;
					const index = position.index;
					const beforeLength = target.length;
					if (restoration.allows(target, arrayLengthWriteKey, lengthVersion)) {
						Array.prototype.splice.call(target, index, 1);
						removeArrayPositions(target, index, 1);
					} else Reflect.deleteProperty(target, String(index));
					notifyRestoration(target, index, beforeLength, restoration);
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
	restoration: MutationRestoration
): void {
	for (let index = start; index < Math.max(beforeLength, target.length); index++)
		restoration.notify(target, String(index));
	if (beforeLength !== target.length) restoration.mark(target, 'length');
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
	const result = method.apply(
		target,
		args.map((value) => unwrap(value))
	);
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

/** Keeps descriptor-sensitive or coercion-driven mutations on the snapshot restoration path. */
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
	for (let index = edit.start; index < target.length; index++) {
		const descriptor = Reflect.getOwnPropertyDescriptor(target, String(index));
		if (
			descriptor &&
			(!('value' in descriptor) || !descriptor.writable || !descriptor.configurable)
		)
			return false;
	}
	return true;
}
