import { reactiveValueChanged } from '../change-detection.js';

/** Private compiler operand for one direct property read owned by a component prop slot. */
export const compiledReactivePropertyOperand = Symbol.for('exact.reactive.property-operand');

/** Identifies a compiler-proven direct property read without allocating a reader function. */
export type CompiledReactivePropertyOperand = readonly [
	marker: typeof compiledReactivePropertyOperand,
	owner: object,
	key: PropertyKey
];

/** Live property operands retain source identity even when their current objects compare equal. */
export function indexedSourceChanged(previous: unknown, value: unknown): boolean {
	const previousOperand =
		Array.isArray(previous) && previous[0] === compiledReactivePropertyOperand;
	const nextOperand = Array.isArray(value) && value[0] === compiledReactivePropertyOperand;
	if (previousOperand || nextOperand)
		return !previousOperand || !nextOperand || previous[1] !== value[1] || previous[2] !== value[2];
	return reactiveValueChanged(previous, value);
}
