import {
	decodeReactiveProtocolValueInternal,
	encodeReactiveProtocolValueInternal,
	encodeValidatedReactiveCollectionInternal
} from './internal/keyed-collections.js';

import { unwrap } from './internal/values.js';

import { listKeyExtractors } from './proxy/state.js';

/** Preserves constants, collections and keyed arrays across JSON transport. maxDepth is a positive safe-integer graph-depth cap, default 100. Cycles remain invalid at every setting. */
export function encodeReactiveProtocolValue(
	value: unknown,
	options: { maxDepth?: number } = {}
): unknown {
	return encodeReactiveProtocolValueInternal(
		value,
		(collection) => listKeyExtractors.get(collection)?.key,
		options.maxDepth
	);
}

/** Wraps encoded array items when their validated source owns compiler-registered list keys. */
export function encodeValidatedReactiveCollection(source: unknown[], items: unknown[]): unknown {
	source = unwrap(source);
	return encodeValidatedReactiveCollectionInternal(
		source,
		items,
		listKeyExtractors.get(source)?.key
	);
}

/** Restores constants, collections and keyed metadata. maxDepth is a positive safe-integer graph-depth cap, default 100. Malformed envelopes and cycles remain invalid at every setting. */
export function decodeReactiveProtocolValue(
	value: unknown,
	options: { maxDepth?: number } = {}
): unknown {
	return decodeReactiveProtocolValueInternal(value, options.maxDepth);
}

/** Samples each encoded occurrence in the existing codec traversal, preserving keyed extractor identity. */
export function encodeArraySubmissionValue(
	value: unknown,
	sample: (source: unknown, encoded: unknown, path: readonly string[], depth: number) => void,
	options: { maxDepth?: number } = {}
): { encoded: unknown; valueDepth: number } {
	let valueDepth = 0;
	const encoded = encodeReactiveProtocolValueInternal(
		value,
		(collection) => listKeyExtractors.get(collection)?.key,
		options.maxDepth,
		(source, encoded, path, depth) => {
			if (source && typeof source === 'object') valueDepth = Math.max(valueDepth, depth);
			sample(source, encoded, path, depth);
		}
	);
	return { encoded, valueDepth };
}
