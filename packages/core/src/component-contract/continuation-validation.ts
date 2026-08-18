import type {
	ExactComponentContinuationContract,
	ExactContinuationStatePathContract
} from '../component-contracts.js';
import { hasOnlyContractKeys, isContractRecord, isContractString } from './metadata-validation.js';

/** Reports whether a generated continuation dependency has a supported source. */
export function isExactContinuationDependency(
	value: unknown
): value is ExactComponentContinuationContract['dependencies'][number] {
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, ['index', 'source', 'path']) &&
		(value.index === undefined ||
			(typeof value.index === 'number' && Number.isSafeInteger(value.index) && value.index >= 0)) &&
		(value.path === undefined || isContractString(value.path)) &&
		(value.source === 'state' ||
			value.source === 'props' ||
			value.source === 'derived' ||
			value.source === 'argument')
	);
}

/** Reports whether generated continuation invocation metadata has a valid protocol shape. */
export function isExactContinuationInvocation(
	value: unknown
): value is ExactComponentContinuationContract['invocation'];
export function isExactContinuationInvocation(
	value: unknown,
	options: { argumentsOptional: true }
): boolean;
export function isExactContinuationInvocation(
	value: unknown,
	options: { argumentsOptional?: boolean } = {}
): boolean {
	if (!isContractRecord(value) || !hasOnlyContractKeys(value, ['arguments', 'concurrency']))
		return false;
	const argumentsValue = value.arguments;
	return (
		((options.argumentsOptional && argumentsValue === undefined) ||
			(Array.isArray(argumentsValue) &&
				argumentsValue.every(
					(argument) =>
						isContractRecord(argument) &&
						hasOnlyContractKeys(argument, ['index', 'source', 'path']) &&
						(argument.index === undefined ||
							(typeof argument.index === 'number' &&
								Number.isSafeInteger(argument.index) &&
								argument.index >= 0)) &&
						(argument.path === undefined || isContractString(argument.path)) &&
						argument.source === 'argument'
				))) &&
		(value.concurrency === 'parallel' ||
			value.concurrency === 'latest' ||
			value.concurrency === 'queue')
	);
}

/** Reports whether a generated continuation state-path descriptor is valid. */
export function isExactContinuationStatePath(
	value: unknown
): value is ExactContinuationStatePathContract {
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, ['path', 'kind', 'confidence', 'operation']) &&
		isContractString(value.path) &&
		(value.kind === 'read' || value.kind === 'write') &&
		(value.confidence === 'exact' ||
			value.confidence === 'broad' ||
			value.confidence === 'unknown') &&
		(value.operation === undefined ||
			value.operation === 'value' ||
			value.operation === 'map' ||
			value.operation === 'set')
	);
}
