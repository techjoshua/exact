import {
	isCompiledPropOperand,
	readCompiledPropOperand
} from '@exactjs/reactive/framework/runtime';
/**
 * Finalizes compiler-owned operands at an atomic delivery or an opaque receiving slot. Authored
 * reactive values and accessor properties are not probed. A descriptor copy preserves unrelated
 * getters and symbol inputs without evaluating them a second time.
 */
export function acquireComponentPropInputs(
	props: Readonly<Record<string, unknown>>,
	finalized: boolean,
	opaque: readonly PropertyKey[] = []
): Readonly<Record<string, unknown>> {
	let descriptors: PropertyDescriptorMap | undefined;
	for (const key of Reflect.ownKeys(props)) {
		const descriptor = Reflect.getOwnPropertyDescriptor(props, key);
		if (
			!descriptor ||
			!descriptor.enumerable ||
			!('value' in descriptor) ||
			!isCompiledPropOperand(descriptor.value) ||
			(!finalized && !opaque.includes(key))
		)
			continue;
		const value = readCompiledPropOperand(descriptor.value);
		descriptors ??= Object.getOwnPropertyDescriptors(props);
		descriptors[key] = {
			value,
			enumerable: descriptor.enumerable,
			configurable: descriptor.configurable,
			writable: 'writable' in descriptor ? descriptor.writable : true
		};
	}
	return descriptors ? Object.create(Object.getPrototypeOf(props), descriptors) : props;
}
