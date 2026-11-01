import { unwrap } from '../values.js';
import { decodeProtocolConstant, protocolConstantToken } from '../protocol-constants.js';

/** Tagged JSON representation of one keyed collection. */
export interface KeyedCollectionEnvelope {
	readonly $exact: 'keyed-collection';
	readonly version: 1;
	readonly keys: string[];
	readonly keyHash: string;
	readonly itemHashes: string[];
	readonly itemsHash: string;
	readonly items: unknown[];
}

/** Tagged JSON representation of one transport-safe Map. */
export interface MapEnvelope {
	readonly $exact: 'map';
	readonly version: 1;
	readonly entries: Array<[unknown, unknown]>;
}

/** Tagged JSON representation of one transport-safe Set. */
export interface SetEnvelope {
	readonly $exact: 'set';
	readonly version: 1;
	readonly values: unknown[];
}

/**
 * Immutable hashes and ordered keys for one validated reactive collection.
 *
 * Callers may reuse this metadata while encoding the same collection's current items. The key and
 * item arrays remain positional protocol facts and must not be mutated or applied to another
 * collection.
 */
export type KeyedCollectionProtocolMetadata = Readonly<{
	keys: readonly string[];
	keyHash: string;
	itemHashes: readonly string[];
	itemsHash: string;
}>;

const hashPattern = /^[0-9a-f]{32}$/;

/** Encodes transport-safe reactive data with caller-owned keyed metadata lookup. */
export function encodeKeyedProtocolValue(
	value: unknown,
	extractorFor: (collection: unknown[]) => ((item: unknown) => string | number) | undefined,
	metadataFor: (
		collection: unknown[],
		key?: (item: unknown) => string | number
	) => KeyedCollectionProtocolMetadata | undefined,
	maximumDepth = 100,
	sample?: (source: unknown, encoded: unknown, path: readonly string[], depth: number) => void
): unknown {
	const maxDepth = Number.isSafeInteger(maximumDepth) && maximumDepth > 0 ? maximumDepth : 100;
	const active = new WeakSet<object>();
	return encodeValue(value, 0);

	function encodeValue(value: unknown, depth: number, path: readonly string[] = []): unknown {
		const source = unwrap(value);
		const encoded = encodeNode(source, depth, path);
		sample?.(source, encoded, path, depth);
		return encoded;
	}
	function encodeNode(value: unknown, depth: number, path: readonly string[]): unknown {
		const constant = protocolConstantToken(value);
		if (constant !== undefined) return { $exact: 'map', version: 1, constant };
		if (!value || typeof value !== 'object') return value;
		if (depth > maxDepth || active.has(value))
			throw new TypeError('Cannot encode cyclic or excessively deep reactive protocol data');
		active.add(value);
		try {
			if (value instanceof Map) {
				const entries: Array<[unknown, unknown]> = [];
				for (const [key, item] of value) {
					assertTransportableMapKey(key);
					entries.push([key, encodeValue(item, depth + 1, [...path, String(entries.length)])]);
				}
				return { $exact: 'map', version: 1, entries } satisfies MapEnvelope;
			}
			if (value instanceof Set)
				return {
					$exact: 'set',
					version: 1,
					values: [...value].map((item, index) =>
						encodeValue(item, depth + 1, [...path, String(index)])
					)
				} satisfies SetEnvelope;
			if (Array.isArray(value)) {
				const metadata = metadataFor(value, extractorFor(value));
				const items = value.map((item, index) =>
					encodeValue(item, depth + 1, [...path, String(index)])
				);
				return metadata ? createKeyedCollectionEnvelope(metadata, items) : items;
			}
			const output: Record<string, unknown> = {};
			for (const key of Object.keys(value))
				defineProtocolProperty(
					output,
					key,
					encodeValue((value as Record<string, unknown>)[key], depth + 1, [...path, key])
				);
			return quoteValidatedProtocolRecord(output);
		} finally {
			active.delete(value);
		}
	}
}

/**
 * Escapes a descriptor-safe validated record whose visible tag overlaps an existing envelope.
 * Returns other records unchanged. Children remain for the caller's encoder or JSON replacer,
 * and unsupported function and symbol property values are omitted. Owned undefined values remain
 * available to the caller's constant encoder.
 * The capsule stays inside the existing map namespace so other application tag values remain literal.
 */
export function quoteValidatedProtocolRecord(value: Record<string, unknown>): unknown {
	const marker = Object.getOwnPropertyDescriptor(value, '$exact');
	const tag: unknown = marker?.enumerable ? marker.value : undefined;
	if (tag !== 'map' && tag !== 'set' && tag !== 'keyed-collection') return value;
	const record: Array<[string, unknown]> = [];
	for (const key of Object.keys(value)) {
		const item = value[key];
		if (typeof item !== 'function' && typeof item !== 'symbol') record.push([key, item]);
	}
	return { $exact: 'map', version: 1, record };
}

/** Decodes reactive protocol data and delegates keyed metadata installation. */
export function decodeKeyedProtocolValue(
	value: unknown,
	install: (items: unknown[], envelope: KeyedCollectionEnvelope) => void,
	maximumDepth = 100
): unknown {
	const maxDepth = Number.isSafeInteger(maximumDepth) && maximumDepth > 0 ? maximumDepth : 100;
	return decodeValue(value, install, new WeakSet(), 0, maxDepth);
}

/** Wraps already encoded items with one collection's stable reactive protocol metadata. */
export function createKeyedCollectionEnvelope(
	metadata: KeyedCollectionProtocolMetadata,
	items: unknown[]
): KeyedCollectionEnvelope {
	return {
		$exact: 'keyed-collection',
		version: 1,
		keys: [...metadata.keys],
		keyHash: metadata.keyHash,
		itemHashes: [...metadata.itemHashes],
		itemsHash: metadata.itemsHash,
		items
	};
}

function defineProtocolProperty(
	output: Record<string, unknown>,
	key: string,
	value: unknown
): void {
	Object.defineProperty(output, key, {
		configurable: true,
		enumerable: true,
		writable: true,
		value
	});
}

function decodeValue(
	value: unknown,
	install: (items: unknown[], envelope: KeyedCollectionEnvelope) => void,
	active: WeakSet<object>,
	depth: number,
	maxDepth: number
): unknown {
	if (!value || typeof value !== 'object') return value;
	if (depth > maxDepth || active.has(value))
		throw new TypeError('Cannot decode cyclic or excessively deep reactive protocol data');
	active.add(value);
	try {
		if (Array.isArray(value))
			return value.map((item) => decodeValue(item, install, active, depth + 1, maxDepth));
		if ((value as Record<string, unknown>).$exact === 'map') {
			if (Object.hasOwn(value, 'constant')) {
				const record = value as Record<string, unknown>;
				if (
					record.version !== 1 ||
					!hasExactEnvelopeKeys(record, ['$exact', 'version', 'constant'])
				)
					throw new TypeError('Malformed eXact constant capsule');
				return decodeProtocolConstant(record.constant);
			}
			if (Object.hasOwn(value, 'record')) {
				const record = value as Record<string, unknown>;
				if (
					record.version !== 1 ||
					!hasExactEnvelopeKeys(record, ['$exact', 'version', 'record']) ||
					!everyEnvelopeSlot(
						record.record,
						(row) => everyEnvelopeSlot(row) && row.length === 2 && typeof row[0] === 'string'
					)
				)
					throw new TypeError('Malformed eXact record escape');
				const entries = record.record as Array<[string, unknown]>;
				if (new Set(entries.map((row) => row[0])).size !== entries.length)
					throw new TypeError('Malformed eXact record escape: duplicate key');
				const output: Record<string, unknown> = {};
				for (const [key, item] of entries)
					defineProtocolProperty(
						output,
						key,
						decodeValue(item, install, active, depth + 1, maxDepth)
					);
				return output;
			}

			const envelope = validateMapEnvelope(value as Record<string, unknown>);
			return new Map(
				envelope.entries.map(([key, item]) => [
					key,
					decodeValue(item, install, active, depth + 1, maxDepth)
				])
			);
		}
		if ((value as Record<string, unknown>).$exact === 'set') {
			const envelope = validateSetEnvelope(value as Record<string, unknown>);
			return new Set(
				envelope.values.map((item) => decodeValue(item, install, active, depth + 1, maxDepth))
			);
		}
		if ((value as Record<string, unknown>).$exact === 'keyed-collection') {
			const envelope = validateEnvelope(value as Record<string, unknown>);
			const items = envelope.items.map((item) =>
				decodeValue(item, install, active, depth + 1, maxDepth)
			);
			install(items, envelope);
			return items;
		}
		const output: Record<string, unknown> = {};
		for (const key of Object.keys(value))
			defineProtocolProperty(
				output,
				key,
				decodeValue((value as Record<string, unknown>)[key], install, active, depth + 1, maxDepth)
			);
		return output;
	} finally {
		active.delete(value);
	}
}

function validateMapEnvelope(value: Record<string, unknown>): MapEnvelope {
	if (
		!hasExactEnvelopeKeys(value, ['$exact', 'version', 'entries']) ||
		value.version !== 1 ||
		!everyEnvelopeSlot(
			value.entries,
			(entry) =>
				everyEnvelopeSlot(entry) && entry.length === 2 && isTransportableReactiveMapKey(entry[0])
		)
	)
		throw new TypeError('Malformed eXact Map envelope');
	return value as unknown as MapEnvelope;
}

function validateSetEnvelope(value: Record<string, unknown>): SetEnvelope {
	if (
		!hasExactEnvelopeKeys(value, ['$exact', 'version', 'values']) ||
		value.version !== 1 ||
		!everyEnvelopeSlot(value.values)
	)
		throw new TypeError('Malformed eXact Set envelope');
	return value as unknown as SetEnvelope;
}

function validateEnvelope(value: Record<string, unknown>): KeyedCollectionEnvelope {
	if (
		!hasExactEnvelopeKeys(value, [
			'$exact',
			'version',
			'keys',
			'keyHash',
			'itemHashes',
			'itemsHash',
			'items'
		]) ||
		value.version !== 1 ||
		!everyEnvelopeSlot(value.keys, (key) => typeof key === 'string') ||
		new Set(value.keys).size !== value.keys.length ||
		!everyEnvelopeSlot(
			value.itemHashes,
			(hash) => typeof hash === 'string' && hashPattern.test(hash)
		) ||
		!everyEnvelopeSlot(value.items) ||
		value.keys.length !== value.itemHashes.length ||
		value.keys.length !== value.items.length ||
		typeof value.keyHash !== 'string' ||
		!hashPattern.test(value.keyHash) ||
		typeof value.itemsHash !== 'string' ||
		!hashPattern.test(value.itemsHash)
	)
		throw new TypeError('Malformed eXact keyed-collection envelope');
	return value as unknown as KeyedCollectionEnvelope;
}

function assertTransportableMapKey(value: unknown): void {
	if (!isTransportableReactiveMapKey(value))
		throw new TypeError(
			'eXact Map protocol keys must be null, boolean, finite number, or string values'
		);
}

/** Reports whether a value can be transported as a reactive Map protocol key. */
export function isTransportableReactiveMapKey(
	value: unknown
): value is null | boolean | number | string {
	return (
		value === null ||
		typeof value === 'boolean' ||
		typeof value === 'string' ||
		(typeof value === 'number' && Number.isFinite(value))
	);
}

function hasExactEnvelopeKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
	const keys = Object.keys(value);
	return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

/** Checks positional wire arrays without skipping holes or accepting inherited entries. */
function everyEnvelopeSlot(value: unknown, valid?: (item: unknown) => boolean): value is unknown[] {
	if (!Array.isArray(value)) return false;
	for (let index = 0; index < value.length; index++)
		if (!Object.hasOwn(value, index) || (valid && !valid(value[index]))) return false;
	return true;
}
