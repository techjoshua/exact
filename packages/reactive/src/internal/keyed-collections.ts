import { hashCanonicalJson, hashStringSequence } from './hash.js';

/** Defines the keyed collection envelope interface contract. */
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

/** Defines the keyed collection metadata interface contract. */
export interface KeyedCollectionMetadata {
	keys: string[];
	keyHash: string;
	itemHashes: string[];
	itemsHash: string;
	structureDirty: boolean;
	dirtyKeys: Set<string>;
	owners: OwnerRecord[];
}

type KeyExtractor = (item: unknown) => string;
type OwnerRecord = { collection: unknown[]; key: string; nodes: object[] };

const metadataByCollection = new WeakMap<object, KeyedCollectionMetadata>();
const ownersByObject = new WeakMap<object, Set<OwnerRecord>>();
const hashPattern = /^[0-9a-f]{32}$/;

/** Performs the seed keyed collection metadata domain operation. */
export function seedKeyedCollectionMetadata(
	collection: unknown[],
	key: KeyExtractor
): KeyedCollectionMetadata | undefined {
	return rebuildMetadata(collection, key);
}

/** Performs the keyed collection metadata domain operation. */
export function keyedCollectionMetadata(
	collection: unknown[],
	key?: KeyExtractor
): KeyedCollectionMetadata | undefined {
	const metadata = metadataByCollection.get(collection);
	if (!metadata) return key ? rebuildMetadata(collection, key) : undefined;
	if (!metadata.structureDirty && metadata.dirtyKeys.size === 0) return metadata;
	if (!key) return undefined;
	if (metadata.structureDirty || keysChanged(collection, metadata.keys, key))
		return rebuildMetadata(collection, key);
	try {
		const dirtyKeys = new Set(metadata.dirtyKeys);
		for (let index = 0; index < collection.length; index++) {
			const itemKey = metadata.keys[index]!;
			if (metadata.dirtyKeys.has(itemKey))
				metadata.itemHashes[index] = hashItem(itemKey, collection[index]);
		}
		metadata.itemsHash = hashStringSequence(metadata.itemHashes, 'exact:keyed-items:v1');
		metadata.dirtyKeys.clear();
		rebindOwners(metadata, collection, dirtyKeys);
		return metadata;
	} catch {
		clearMetadata(collection);
		return undefined;
	}
}

/** Performs the mark reactive hash dirty domain operation. */
export function markReactiveHashDirty(target: object): void {
	const own = metadataByCollection.get(target);
	if (own) own.structureDirty = true;
	for (const owner of ownersByObject.get(target) ?? [])
		ownerMetadata(owner)?.dirtyKeys.add(owner.key);
}

/** Performs the install keyed collection metadata domain operation. */
export function installKeyedCollectionMetadata(
	collection: unknown[],
	source: Pick<KeyedCollectionMetadata, 'keys' | 'keyHash' | 'itemHashes' | 'itemsHash'>,
	bindMutationOwners = true
): void {
	clearMetadata(collection);
	const metadata: KeyedCollectionMetadata = {
		keys: [...source.keys],
		keyHash: source.keyHash,
		itemHashes: [...source.itemHashes],
		itemsHash: source.itemsHash,
		structureDirty: false,
		dirtyKeys: new Set(),
		owners: []
	};
	metadataByCollection.set(collection, metadata);
	if (bindMutationOwners) bindOwners(metadata, collection);
}

/** Performs the adopt keyed collection metadata domain operation. */
export function adoptKeyedCollectionMetadata(
	collection: unknown[],
	source: Pick<KeyedCollectionMetadata, 'keys' | 'keyHash' | 'itemHashes' | 'itemsHash'>,
	changedKeys: ReadonlySet<string>
): void {
	const metadata = metadataByCollection.get(collection);
	if (!metadata) {
		installKeyedCollectionMetadata(collection, source);
		return;
	}
	const previousOwners = new Map<string, OwnerRecord>();
	for (let index = 0; index < metadata.keys.length; index++) {
		const owner = metadata.owners[index];
		if (owner) previousOwners.set(metadata.keys[index]!, owner);
	}
	const retainedOwners = new Set<OwnerRecord>();
	const nextOwners: OwnerRecord[] = [];
	for (let index = 0; index < source.keys.length; index++) {
		const key = source.keys[index]!;
		const previous = previousOwners.get(key);
		if (previous && !changedKeys.has(key)) {
			retainedOwners.add(previous);
			nextOwners.push(previous);
			continue;
		}
		if (previous) clearOwner(previous);
		nextOwners.push(createOwner(collection, key, collection[index]));
	}
	for (const owner of metadata.owners)
		if (!retainedOwners.has(owner) && !changedKeys.has(owner.key)) clearOwner(owner);
	metadata.owners = nextOwners;
	metadata.keys = [...source.keys];
	metadata.keyHash = source.keyHash;
	metadata.itemHashes = [...source.itemHashes];
	metadata.itemsHash = source.itemsHash;
	metadata.structureDirty = false;
	metadata.dirtyKeys.clear();
}

/** Produces a reactive protocol value internal in its external representation. */
export function encodeReactiveProtocolValueInternal(
	value: unknown,
	extractorFor: (collection: unknown[]) => KeyExtractor | undefined
): unknown {
	return encodeValue(value, extractorFor, new WeakSet(), 0);
}

/** Reads a reactive protocol value internal from its source representation. */
export function decodeReactiveProtocolValueInternal(value: unknown): unknown {
	return decodeValue(value, new WeakSet(), 0);
}

function rebuildMetadata(
	collection: unknown[],
	key: KeyExtractor
): KeyedCollectionMetadata | undefined {
	try {
		const keys: string[] = [];
		const itemHashes: string[] = [];
		const seen = new Set<string>();
		for (const item of collection) {
			const itemKey = String(key(item));
			if (seen.has(itemKey)) throw new Error(`Duplicate key "${itemKey}"`);
			seen.add(itemKey);
			keys.push(itemKey);
			itemHashes.push(hashItem(itemKey, item));
		}
		clearMetadata(collection);
		const metadata: KeyedCollectionMetadata = {
			keys,
			keyHash: hashStringSequence(keys, 'exact:keyed-keys:v1'),
			itemHashes,
			itemsHash: hashStringSequence(itemHashes, 'exact:keyed-items:v1'),
			structureDirty: false,
			dirtyKeys: new Set(),
			owners: []
		};
		metadataByCollection.set(collection, metadata);
		bindOwners(metadata, collection);
		return metadata;
	} catch {
		clearMetadata(collection);
		return undefined;
	}
}

function keysChanged(collection: unknown[], keys: readonly string[], key: KeyExtractor): boolean {
	if (collection.length !== keys.length) return true;
	for (let index = 0; index < collection.length; index++)
		if (String(key(collection[index])) !== keys[index]) return true;
	return false;
}

function hashItem(key: string, value: unknown): string {
	return hashCanonicalJson([key, value], 'exact:keyed-item:v1');
}

function bindOwners(metadata: KeyedCollectionMetadata, collection: unknown[]): void {
	clearOwners(metadata);
	for (let index = 0; index < collection.length; index++) {
		const owner = createOwner(collection, metadata.keys[index]!, collection[index]);
		metadata.owners.push(owner);
	}
}

function rebindOwners(
	metadata: KeyedCollectionMetadata,
	collection: unknown[],
	keys: ReadonlySet<string>
): void {
	for (let index = 0; index < metadata.keys.length; index++) {
		if (!keys.has(metadata.keys[index]!)) continue;
		const previous = metadata.owners[index];
		if (previous) clearOwner(previous);
		const owner = createOwner(collection, metadata.keys[index]!, collection[index]);
		metadata.owners[index] = owner;
	}
}

function createOwner(collection: unknown[], key: string, value: unknown): OwnerRecord {
	const nodes: object[] = [];
	collectJsonObjects(value, nodes, new WeakSet(), 0);
	const owner: OwnerRecord = { collection, key, nodes };
	for (const node of nodes) {
		let owners = ownersByObject.get(node);
		if (!owners) ownersByObject.set(node, (owners = new Set()));
		owners.add(owner);
	}
	return owner;
}

function collectJsonObjects(
	value: unknown,
	output: object[],
	seen: WeakSet<object>,
	depth: number
): void {
	if (!value || typeof value !== 'object' || seen.has(value) || depth > 100) return;
	seen.add(value);
	output.push(value);
	if (Array.isArray(value)) {
		for (const item of value) collectJsonObjects(item, output, seen, depth + 1);
	} else {
		for (const key of Object.keys(value)) {
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (descriptor && 'value' in descriptor)
				collectJsonObjects(descriptor.value, output, seen, depth + 1);
		}
	}
}

function clearMetadata(collection: unknown[]): void {
	const metadata = metadataByCollection.get(collection);
	if (metadata) clearOwners(metadata);
	metadataByCollection.delete(collection);
}

function clearOwners(metadata: KeyedCollectionMetadata): void {
	for (const owner of metadata.owners) clearOwner(owner);
	metadata.owners = [];
}

function clearOwner(owner: OwnerRecord): void {
	for (const node of owner.nodes) {
		const owners = ownersByObject.get(node);
		owners?.delete(owner);
		if (owners?.size === 0) ownersByObject.delete(node);
	}
}

function ownerMetadata(owner: OwnerRecord): KeyedCollectionMetadata | undefined {
	return metadataByCollection.get(owner.collection);
}

function encodeValue(
	value: unknown,
	extractorFor: (collection: unknown[]) => KeyExtractor | undefined,
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
				entries.push([key, encodeValue(item, extractorFor, active, depth + 1)]);
			}
			return {
				$exact: 'map',
				version: 1,
				entries
			} satisfies MapEnvelope;
		}
		if (value instanceof Set) {
			return {
				$exact: 'set',
				version: 1,
				values: [...value].map((item) => encodeValue(item, extractorFor, active, depth + 1))
			} satisfies SetEnvelope;
		}
		if (Array.isArray(value)) {
			const metadata = keyedCollectionMetadata(value, extractorFor(value));
			const items = value.map((item) => encodeValue(item, extractorFor, active, depth + 1));
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
		for (const key of Object.keys(value)) {
			Object.defineProperty(output, key, {
				configurable: true,
				enumerable: true,
				writable: true,
				value: encodeValue((value as Record<string, unknown>)[key], extractorFor, active, depth + 1)
			});
		}
		return output;
	} finally {
		active.delete(value);
	}
}

function decodeValue(value: unknown, active: WeakSet<object>, depth: number): unknown {
	if (!value || typeof value !== 'object') return value;
	if (depth > 100 || active.has(value))
		throw new TypeError('Cannot decode cyclic or excessively deep reactive protocol data');
	active.add(value);
	try {
		if (Array.isArray(value)) return value.map((item) => decodeValue(item, active, depth + 1));
		if ((value as Record<string, unknown>).$exact === 'map') {
			const envelope = validateMapEnvelope(value as Record<string, unknown>);
			return new Map(
				envelope.entries.map(([key, item]) => [key, decodeValue(item, active, depth + 1)])
			);
		}
		if ((value as Record<string, unknown>).$exact === 'set') {
			const envelope = validateSetEnvelope(value as Record<string, unknown>);
			return new Set(envelope.values.map((item) => decodeValue(item, active, depth + 1)));
		}
		if ((value as Record<string, unknown>).$exact === 'keyed-collection') {
			const envelope = validateEnvelope(value as Record<string, unknown>);
			const items = envelope.items.map((item) => decodeValue(item, active, depth + 1));
			// Incoming snapshots are immutable comparison candidates. Ownership links
			// are attached only if the collection is adopted or registered as live state.
			installKeyedCollectionMetadata(items, envelope, false);
			return items;
		}
		const output: Record<string, unknown> = {};
		for (const key of Object.keys(value)) {
			Object.defineProperty(output, key, {
				configurable: true,
				enumerable: true,
				writable: true,
				value: decodeValue((value as Record<string, unknown>)[key], active, depth + 1)
			});
		}
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
			(entry) => Array.isArray(entry) && entry.length === 2 && isTransportableMapKey(entry[0])
		)
	) {
		throw new TypeError('Malformed eXact Map envelope');
	}
	return value as unknown as MapEnvelope;
}

function validateSetEnvelope(value: Record<string, unknown>): SetEnvelope {
	if (
		!hasOnlyEnvelopeKeys(value, ['$exact', 'version', 'values']) ||
		value.version !== 1 ||
		!Array.isArray(value.values)
	) {
		throw new TypeError('Malformed eXact Set envelope');
	}
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
	) {
		throw new TypeError('Malformed eXact keyed-collection envelope');
	}
	return value as unknown as KeyedCollectionEnvelope;
}

function assertTransportableMapKey(value: unknown): void {
	if (!isTransportableMapKey(value))
		throw new TypeError(
			'eXact Map protocol keys must be null, boolean, finite number, or string values'
		);
}

function isTransportableMapKey(value: unknown): value is null | boolean | number | string {
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
