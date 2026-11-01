import type {
	IntlElementFactory,
	IntlOpaqueFactory,
	IntlRuntimeDescriptorV1,
	IntlStructureFactory
} from './contracts.js';
import { validateIntlRuntimeDescriptor } from './validation.js';
import { captureArray } from './protocol-data.js';

const preparedIntlActivation = Symbol('@exactjs/intl.prepared-activation');
const validatedDescriptors = new WeakMap<object, IntlRuntimeDescriptorV1>();

/** Internal, branded activation produced by generated build companions. */
export interface PreparedIntlActivation {
	readonly [preparedIntlActivation]: true;
	readonly descriptor: IntlRuntimeDescriptorV1;
	readonly values: readonly unknown[];
	readonly structures: readonly IntlStructureFactory[];
	readonly target?: IntlElementFactory;
}

/** Creates a validated activation from generated scalar values and structure factories. */
export function prepareIntlActivation(
	descriptorInput: unknown,
	values: readonly unknown[],
	structures: readonly IntlStructureFactory[] = [],
	target?: IntlElementFactory
): PreparedIntlActivation {
	const descriptor = cachedDescriptor(descriptorInput);
	const capturedValues = captureArray(values, 'Intl activation values');
	const capturedStructures = captureArray(structures, 'Intl activation structures');
	for (const structure of capturedStructures)
		if (typeof structure !== 'function')
			throw new TypeError('Intl structure entries must be functions');
	let valueCount = 0;
	let structureCount = 0;
	for (const binding of descriptor.bindings) {
		if (binding.kind === 'element' || binding.kind === 'opaque') structureCount++;
		else valueCount++;
	}
	if (capturedValues.length !== valueCount)
		throw new TypeError(
			`Intl activation expected ${valueCount} values but received ${capturedValues.length}`
		);
	if (capturedStructures.length !== structureCount)
		throw new TypeError(
			`Intl activation expected ${structureCount} structure factories but received ${capturedStructures.length}`
		);
	if (target !== undefined && typeof target !== 'function')
		throw new TypeError('Intl target entry must be a function');
	return Object.freeze({
		[preparedIntlActivation]: true as const,
		descriptor,
		values: Object.freeze(capturedValues),
		structures: Object.freeze(capturedStructures as IntlStructureFactory[]),
		...(target ? { target } : {})
	});
}

function cachedDescriptor(input: unknown): IntlRuntimeDescriptorV1 {
	if (typeof input !== 'object' || input === null) return validateIntlRuntimeDescriptor(input);
	const cached = validatedDescriptors.get(input);
	if (cached) return cached;
	const descriptor = validateIntlRuntimeDescriptor(input);
	validatedDescriptors.set(input, descriptor);
	return descriptor;
}

/** Reports whether an unknown value is a package-created prepared activation. */
export function isPreparedIntlActivation(value: unknown): value is PreparedIntlActivation {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as Partial<PreparedIntlActivation>)[preparedIntlActivation] === true
	);
}

/** Resolves a descriptor binding to its generated scalar value or structure factory. */
export function resolveIntlBinding(
	activation: PreparedIntlActivation,
	bindingIndex: number
): unknown | IntlElementFactory | IntlOpaqueFactory {
	let valueIndex = 0;
	let structureIndex = 0;
	for (const binding of activation.descriptor.bindings) {
		const candidate =
			binding.kind === 'element' || binding.kind === 'opaque'
				? activation.structures[structureIndex++]
				: activation.values[valueIndex++];
		if (binding.index === bindingIndex) return candidate;
	}
	throw new RangeError(`Intl binding ${bindingIndex} is not declared`);
}
