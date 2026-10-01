import type { PendingReactiveState } from './pending-state-contract.js';
import type { PendingInvocationCells } from './pending-cells.js';
import type { PendingPropertyValue } from './pending-reflection.js';
import { pendingArrayIndex } from './pending-property-policy.js';

/** Retains sparse length and truncation metadata without copying untouched slots. Invalid lengths retain native coercion errors. */
export function retainPendingArrayWrite(
	cells: PendingInvocationCells,
	target: unknown[],
	key: PropertyKey,
	value: unknown,
	properties: Map<PropertyKey, PendingPropertyValue>
): unknown {
	let array = cells.arrays?.get(target);
	if (!array)
		(cells.arrays ??= new WeakMap()).set(
			target,
			(array = { length: target.length, cutoff: target.length })
		);
	const index = pendingArrayIndex(key);
	if (key !== 'length') {
		if (index !== undefined) array.length = Math.max(array.length, index + 1);
		return value;
	}
	let length: number;
	if (typeof value === 'number') {
		if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff)
			throw new RangeError('Invalid array length');
		length = Math.max(0, value);
	} else {
		const validation: unknown[] = [];
		Reflect.set(validation, 'length', value);
		length = validation.length;
	}
	if (length < array.length) {
		array.cutoff = Math.min(array.cutoff, length);
		for (const property of properties.keys()) {
			const position = pendingArrayIndex(property);
			if (position !== undefined && position >= length) properties.delete(property);
		}
	}
	array.length = length;
	return length;
}

const callbackMethods = new Set<PropertyKey>([
	'every',
	'some',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'filter',
	'map',
	'flatMap',
	'forEach',
	'reduce',
	'reduceRight'
]);

/** Identifies native Array operations that must reject readonly policy before callbacks run. */
export const pendingArrayMutators = new Set<PropertyKey>([
	'copyWithin',
	'fill',
	'pop',
	'push',
	'reverse',
	'shift',
	'sort',
	'splice',
	'unshift'
]);

/**
 * Runs native Array algorithms over invocation cells. The private algorithm receiver never
 * crosses an authored callback boundary. Callbacks and identity-returning methods retain the
 * original array. Untouched slots read committed storage without a whole-array copy.
 */
export function createPendingArrayView(
	context: PendingReactiveState,
	receiver: unknown[]
): unknown[] {
	return new Proxy<unknown[]>([], {
		get: (_target, property) => context.read(receiver, property),
		has: (_target, property) => context.has(receiver, property),
		set: (_target, property, value) => {
			context.write(receiver, property, value);
			return true;
		},
		deleteProperty: (_target, property) => context.remove(receiver, property)
	});
}

/** Runs a selected native algorithm on a reused private view and preserves authored callback identity. */
export function applyPendingArray(
	view: unknown[],
	receiver: unknown[],
	key: PropertyKey,
	method: (...args: unknown[]) => unknown,
	args: unknown[]
): unknown {
	let input = args;
	if (callbackMethods.has(key) && typeof args[0] === 'function') {
		const callback = args[0];
		input = [...args];
		input[0] = function (this: unknown, ...values: unknown[]) {
			values[values.length - 1] = receiver;
			return Reflect.apply(callback, this, values);
		};
	}
	const result = Reflect.apply(method, view, input);
	return result === view ? receiver : result;
}
