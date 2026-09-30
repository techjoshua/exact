import {
	arrayPosition,
	prepareArrayPositions,
	moveArrayPositions,
	type ArrayPosition
} from './positions.js';
import {
	recordTransactionUndo,
	retainTransactionArray,
	trigger,
	type MutationRestoration
} from '../internal/deps.js';
import { iterateKey } from '../internal/symbols.js';
import { unwrap } from '../internal/values.js';

const orderKey = Symbol('array-order');
const hole = Symbol('array-hole');
const negativeZero = Symbol('array-negative-zero');

/** Captures entry addresses before a native permutation can move a pending optimistic value. */
export function captureArrayOrder(target: unknown[]): readonly ArrayPosition[] {
	retainTransactionArray(target);
	prepareArrayPositions(target);
	return Array.from({ length: target.length }, (_, index) => arrayPosition(target, index, true)!);
}

/**
 * Retains entry ownership through native reversal and stable sorting. Reordering owns sequence
 * order, while value writes remain owned by their entries. Non-permutation callback effects use
 * the ordinary mutation journal instead.
 */
export function recordArrayReorder(
	target: unknown[],
	previous: unknown[],
	before: readonly ArrayPosition[],
	method: string
): boolean {
	if (target.length !== previous.length || before.some((entry, index) => entry.index !== index))
		return false;
	const destinations = new Array<number>(target.length);
	if (method === 'reverse') {
		for (let index = 0; index < target.length; index++) {
			const destination = target.length - index - 1;
			if (!Object.is(slot(previous, index), slot(target, destination))) return false;
			destinations[index] = destination;
		}
	} else {
		const occurrences = new Map<unknown, { indices: number[]; next: number }>();
		for (let index = 0; index < previous.length; index++) {
			const value = slot(previous, index);
			let group = occurrences.get(value);
			if (!group) occurrences.set(value, (group = { indices: [], next: 0 }));
			group.indices.push(index);
		}
		for (let index = 0; index < target.length; index++) {
			const group = occurrences.get(slot(target, index));
			const source = group?.indices[group.next++];
			if (source === undefined) return false;
			destinations[source] = index;
		}
	}
	if (destinations.every((index, original) => index === original)) return true;
	moveArrayPositions(before, destinations);
	recordTransactionUndo(
		(restoration) => restoreOrder(target, before, restoration),
		target,
		orderKey
	);
	trigger(target, orderKey);
	return true;
}

function slot(array: unknown[], index: number): unknown {
	if (!Object.hasOwn(array, index)) return hole;
	const value = unwrap(array[index]);
	return Object.is(value, -0) ? negativeZero : value;
}

/** Restores the surviving original entries without recreating rejected insertions or overwriting values. */
function restoreOrder(
	target: unknown[],
	before: readonly ArrayPosition[],
	restoration: MutationRestoration
): void {
	const entries = before.filter((entry) => entry.index >= 0);
	const destinations = entries.map((entry) => entry.index).sort((left, right) => left - right);
	const descriptors = entries.map((entry) =>
		Reflect.getOwnPropertyDescriptor(target, String(entry.index))
	);
	entries.forEach((_, offset) => {
		const index = destinations[offset]!;
		const descriptor = descriptors[offset];
		if (descriptor) Reflect.defineProperty(target, String(index), descriptor);
		else Reflect.deleteProperty(target, String(index));
		restoration.notify(target, String(index));
	});
	moveArrayPositions(entries, destinations);
	restoration.mark(target, orderKey);
	restoration.notify(target, iterateKey);
}
