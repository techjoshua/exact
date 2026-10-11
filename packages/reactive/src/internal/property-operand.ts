import { reactiveValueChanged } from '../change-detection.js';

/** Private compiler operand for one direct property read owned by a component prop slot. */
export const compiledReactivePropertyOperand = Symbol.for('exact.reactive.property-operand');

/** Identifies a compiler-proven direct property read without allocating a reader function. */
export type CompiledReactivePropertyOperand = readonly [
	marker: typeof compiledReactivePropertyOperand,
	owner: object,
	key: PropertyKey
];

/** Recognizes compiler data operands without evaluating an ordinary Array's indexed getter. */
export function isCompiledReactivePropertyOperand(
	value: unknown
): value is CompiledReactivePropertyOperand {
	return (
		Array.isArray(value) &&
		Reflect.getOwnPropertyDescriptor(value, '0')?.value === compiledReactivePropertyOperand
	);
}

/** Live property operands retain source identity even when their current objects compare equal. */
export function indexedSourceChanged(previous: unknown, value: unknown): boolean {
	const previousOperand = isCompiledReactivePropertyOperand(previous);
	const nextOperand = isCompiledReactivePropertyOperand(value);
	if (previousOperand || nextOperand)
		return !previousOperand || !nextOperand || previous[1] !== value[1] || previous[2] !== value[2];
	return reactiveValueChanged(previous, value);
}
