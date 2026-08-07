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

type Metadata = Readonly<{
	keys: readonly string[];
	keyHash: string;
	itemHashes: readonly string[];
	itemsHash: string;
}>;

const hashPattern = /^[0-9a-f]{32}$/;

/** Encodes transport-safe reactive data with caller-owned keyed metadata lookup. */
export function encodeKeyedProtocolValue(
	value: unknown,
	extractorFor: (collection: unknown[]) => ((item: unknown) => string) | undefined,
	metadataFor: (collection: unknown[], key?: (item: unknown) => string) => Metadata | undefined
): unknown {
	return encodeValue(value, extractorFor, metadataFor, new WeakSet(), 0);
}

/** Decodes reactive protocol data and delegates keyed metadata installation. */
export function decodeKeyedProtocolValue(
	value: unknown,
	install: (items: unknown[], envelope: KeyedCollectionEnvelope) => void
): unknown {
	return decodeValue(value, install, new WeakSet(), 0);
}

function encodeValue(
	value: unknown,
	extractorFor: (collection: unknown[]) => ((item: unknown) => string) | undefined,
	metadataFor: (collection: unknown[], key?: (item: unknown) => string) => Metadata | undefined,
	active: WeakSet<object>,
	depth: number
): unknown {
	if (!value || typeof value !== 'object') return value;
	if (depth > 100 || active.has(value))
		throw new TypeError('Cannot encode cyclic or excessively deep reactive protocol data');
	active.add(value);
	try {
		if (value instanceof Map) {
			const entries: Array<[unknown, unknown]> = [];
			for (const [key, item] of value) {
				assertTransportableMapKey(key);
				entries.push([key, encodeValue(item, extractorFor, metadataFor, active, depth + 1)]);
			}
			return { $exact: 'map', version: 1, entries } satisfies MapEnvelope;
		}
		if (value instanceof Set)
			return {
				$exact: 'set',
				version: 1,
				values: [...value].map((item) =>
					encodeValue(item, extractorFor, metadataFor, active, depth + 1)
				)
			} satisfies SetEnvelope;
		if (Array.isArray(value)) {
			const metadata = metadataFor(value, extractorFor(value));
			const items = value.map((item) =>
				encodeValue(item, extractorFor, metadataFor, active, depth + 1)
			);
			if (!metadata) return items;
			return {
				$exact: 'keyed-collection',
				version: 1,
				keys: [...metadata.keys],
				keyHash: metadata.keyHash,
				itemHashes: [...metadata.itemHashes],
				itemsHash: metadata.itemsHash,
				items
			} satisfies KeyedCollectionEnvelope;
		}
		const output: Record<string, unknown> = {};
		for (const key of Object.keys(value))
			Object.defineProperty(output, key, {
				configurable: true,
				enumerable: true,
				writable: true,
				value: encodeValue(
					(value as Record<string, unknown>)[key],
					extractorFor,
					metadataFor,
					active,
					depth + 1
				)
			});
		return output;
	} finally {
		active.delete(value);
	}
}

function decodeValue(
	value: unknown,
	install: (items: unknown[], envelope: KeyedCollectionEnvelope) => void,
	active: WeakSet<object>,
	depth: number
): unknown {
	if (!value || typeof value !== 'object') return value;
	if (depth > 100 || active.has(value))
		throw new TypeError('Cannot decode cyclic or excessively deep reactive protocol data');
	active.add(value);
	try {
		if (Array.isArray(value))
			return value.map((item) => decodeValue(item, install, active, depth + 1));
		if ((value as Record<string, unknown>).$exact === 'map') {
			const envelope = validateMapEnvelope(value as Record<string, unknown>);
			return new Map(
				envelope.entries.map(([key, item]) => [key, decodeValue(item, install, active, depth + 1)])
			);
		}
		if ((value as Record<string, unknown>).$exact === 'set') {
			const envelope = validateSetEnvelope(value as Record<string, unknown>);
			return new Set(envelope.values.map((item) => decodeValue(item, install, active, depth + 1)));
		}
		if ((value as Record<string, unknown>).$exact === 'keyed-collection') {
			const envelope = validateEnvelope(value as Record<string, unknown>);
			const items = envelope.items.map((item) => decodeValue(item, install, active, depth + 1));
			install(items, envelope);
			return items;
		}
		const output: Record<string, unknown> = {};
		for (const key of Object.keys(value))
			Object.defineProperty(output, key, {
				configurable: true,
				enumerable: true,
				writable: true,
				value: decodeValue((value as Record<string, unknown>)[key], install, active, depth + 1)
			});
		return output;
	} finally {
		active.delete(value);
	}
}

function validateMapEnvelope(value: Record<string, unknown>): MapEnvelope {
	if (
		!hasOnlyEnvelopeKeys(value, ['$exact', 'version', 'entries']) ||
		value.version !== 1 ||
		!Array.isArray(value.entries) ||
		!value.entries.every(
			(entry) =>
				Array.isArray(entry) && entry.length === 2 && isTransportableReactiveMapKey(entry[0])
		)
	)
		throw new TypeError('Malformed eXact Map envelope');
	return value as unknown as MapEnvelope;
}

function validateSetEnvelope(value: Record<string, unknown>): SetEnvelope {
	if (
		!hasOnlyEnvelopeKeys(value, ['$exact', 'version', 'values']) ||
		value.version !== 1 ||
		!Array.isArray(value.values)
	)
		throw new TypeError('Malformed eXact Set envelope');
	return value as unknown as SetEnvelope;
}

function validateEnvelope(value: Record<string, unknown>): KeyedCollectionEnvelope {
	const allowed = new Set([
		'$exact',
		'version',
		'keys',
		'keyHash',
		'itemHashes',
		'itemsHash',
		'items'
	]);
	if (
		Object.keys(value).some((key) => !allowed.has(key)) ||
		value.version !== 1 ||
		!Array.isArray(value.keys) ||
		!value.keys.every((key) => typeof key === 'string') ||
		new Set(value.keys).size !== value.keys.length ||
		!Array.isArray(value.itemHashes) ||
		!value.itemHashes.every((hash) => typeof hash === 'string' && hashPattern.test(hash)) ||
		!Array.isArray(value.items) ||
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

function hasOnlyEnvelopeKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
	const keys = new Set(allowed);
	return Object.keys(value).every((key) => keys.has(key));
}
