import type { ReactiveValue } from './types.js';
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
	const previousOperand = isCompiledPropOperand(previous);
	const nextOperand = isCompiledPropOperand(value);
	if (previousOperand || nextOperand)
		return (
			!previousOperand ||
			!nextOperand ||
			previous[0] !== value[0] ||
			previous[1] !== value[1] ||
			(!isCompiledExpressionOperand(previous) &&
				!isCompiledExpressionOperand(value) &&
				previous[2] !== value[2])
		);
	return reactiveValueChanged(previous, value);
}

/** Compiler-only expression operand. The snapshot cell protects authored payload identity. */
export const compiledReactiveExpressionOperand = Symbol.for('exact.reactive.prop-expression');
/** One lazy source cell whose private carrier is never delivered as an authored prop. */
export type CompiledExpressionOperand<T = unknown> = readonly [
	marker: typeof compiledReactiveExpressionOperand,
	cell: ReactiveValue<Readonly<{ value: T }>>
];
/** Recognizes exact compiler allocation without reading arbitrary array accessors. */
export function isCompiledExpressionOperand(value: unknown): value is CompiledExpressionOperand {
	return (
		Array.isArray(value) &&
		Reflect.getOwnPropertyDescriptor(value, '0')?.value === compiledReactiveExpressionOperand
	);
}
/** Recognizes only the two compiler-owned prop operand representations. */
export function isCompiledPropOperand(
	value: unknown
): value is CompiledReactivePropertyOperand | CompiledExpressionOperand {
	return isCompiledReactivePropertyOperand(value) || isCompiledExpressionOperand(value);
}
/** Acquires one authored result, without reading a returned ReactiveValue or calling a function. */
export function readCompiledPropOperand(
	value: CompiledReactivePropertyOperand | CompiledExpressionOperand
): unknown {
	return isCompiledExpressionOperand(value)
		? value[1].get().value
		: Reflect.get(value[1], value[2]);
}
