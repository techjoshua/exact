import { hashCanonicalJson, hashStringSequence } from './hash.js';
import {
	createKeyedCollectionEnvelope,
	decodeKeyedProtocolValue,
	encodeKeyedProtocolValue
} from './keyed/protocol.js';
export type { KeyedCollectionEnvelope, MapEnvelope, SetEnvelope } from './keyed/protocol.js';

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

/** Performs the seed keyed collection metadata domain operation. */
export function seedKeyedCollectionMetadata(
	collection: unknown[],
	key: KeyExtractor
): KeyedCollectionMetadata | undefined {
	return rebuildMetadata(collection, key);
}

/** Releases keyed metadata and every reverse mutation-owner link for one retired collection. */
export function releaseKeyedCollectionMetadata(collection: unknown[]): void {
	clearMetadata(collection);
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
	return encodeKeyedProtocolValue(value, extractorFor, keyedCollectionMetadata);
}

/** Adds keyed-list metadata to array items serialized by a validated outer protocol traversal. */
export function encodeValidatedReactiveCollectionInternal(
	collection: unknown[],
	items: unknown[],
	extractor: KeyExtractor | undefined
): unknown[] | import('./keyed/protocol.js').KeyedCollectionEnvelope {
	const metadata = keyedCollectionMetadata(collection, extractor);
	return metadata ? createKeyedCollectionEnvelope(metadata, items) : items;
}

/** Reads a reactive protocol value internal from its source representation. */
export function decodeReactiveProtocolValueInternal(value: unknown): unknown {
	return decodeKeyedProtocolValue(value, (items, envelope) =>
		installKeyedCollectionMetadata(items, envelope, false)
	);
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
