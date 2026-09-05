import {
	decodeReactiveProtocolValueInternal,
	encodeReactiveProtocolValueInternal,
	encodeValidatedReactiveCollectionInternal
} from './internal/keyed-collections.js';

import { unwrap } from './internal/values.js';

import { listKeyExtractors } from './proxy/state.js';

/** Encodes registered keyed arrays into the eXact server-to-client JSON protocol shape. */
export function encodeReactiveProtocolValue(value: unknown): unknown {
	return encodeReactiveProtocolValueInternal(
		unwrap(value),
		(collection) => listKeyExtractors.get(collection)?.key
	);
}

/** Wraps encoded array items when their validated source owns compiler-registered list keys. */
export function encodeValidatedReactiveCollection(source: unknown[], items: unknown[]): unknown {
	return encodeValidatedReactiveCollectionInternal(
		source,
		items,
		listKeyExtractors.get(source)?.key
	);
}

/** Decodes eXact keyed-collection envelopes into ordinary arrays with hash sidecars. */
export function decodeReactiveProtocolValue(value: unknown): unknown {
	return decodeReactiveProtocolValueInternal(value);
}
