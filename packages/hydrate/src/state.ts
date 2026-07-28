import type { ExactCollectionMutation, ExactContinuationStatePathContract } from '@exactjs/core';
import { isSafeObjectKey } from './safety.js';

type MutableStateContainer = Record<string, unknown> | unknown[];
type StateReadContract = {
	readonly reads?: readonly ExactContinuationStatePathContract[];
};
type StateWriteContract = {
	readonly writes?: readonly ExactContinuationStatePathContract[];
};

/** Returns only the client state paths required by an exact server action contract. */
export function stateForContract(state: unknown, contract: StateReadContract | undefined): unknown {
	if (!contract) return state;
	const reads =
		contract.reads?.filter((read) => read.kind === 'read' && read.confidence === 'exact') ?? [];
	if (!reads.length) return undefined;
	if (reads.some((read) => read.path === '*')) return state;
	const output: Record<string, unknown> = {};
	for (const read of reads) {
		const value = getPath(state, read.path);
		if (value !== undefined) setPath(output, read.path, value);
	}
	return Object.keys(output).length ? output : undefined;
}

/**
 * Validates and merges the partial state returned by a continuation.
 *
 * The returned object may contain only exact compiler-declared write paths.
 * Parent writes replace their complete subtree; unrelated client state is
 * retained. A wildcard write deliberately authorizes full replacement.
 */
export function mergeStateForContract(
	state: unknown,
	update: unknown,
	contract: StateWriteContract
): { ok: true; state: unknown } | { ok: false } {
	const writes =
		contract.writes?.filter((write) => write.kind === 'write' && write.confidence === 'exact') ??
		[];
	if (writes.some((write) => write.path === '*')) return { ok: true, state: update };
	if (!update || typeof update !== 'object' || Array.isArray(update)) return { ok: false };
	const paths = writes.map((write) => write.path);
	if (!stateNodeMatchesWrites(update, '', paths)) return { ok: false };

	let output = cloneContainer(state);
	for (const path of paths) {
		const value = getPath(update, path);
		if (value === undefined) continue;
		if (!output) output = {};
		setPath(output as Record<string, unknown>, path, value);
	}
	return { ok: true, state: output ?? state };
}

/** Commits validated continuation writes into a live reactive component state object. */
export function commitStateForContract(
	target: Record<string, unknown>,
	update: unknown,
	contract: StateWriteContract
): void {
	const writes =
		contract.writes?.filter((write) => write.kind === 'write' && write.confidence === 'exact') ??
		[];
	if (writes.some((write) => write.path === '*')) {
		if (!update || typeof update !== 'object' || Array.isArray(update)) return;
		for (const key of Object.keys(target))
			if (!Object.prototype.hasOwnProperty.call(update, key)) delete target[key];
		Object.assign(target, update);
		return;
	}
	for (const write of writes) {
		const value = getPath(update, write.path);
		if (value !== undefined) setPath(target, write.path, value);
	}
}

/** Validates and immutably applies ordered Map and Set continuation deltas. */
export function mergeCollectionMutationsForContract(
	state: unknown,
	mutations: readonly ExactCollectionMutation[],
	contract: StateWriteContract
): { ok: true; state: unknown } | { ok: false } {
	const allowed = collectionWritePaths(contract);
	const output = cloneContainer(state);
	if (!output) return { ok: false };
	const cloned = new Set<string>();
	for (const mutation of mutations) {
		const expected = mutation.operation.startsWith('map-') ? 'map' : 'set';
		if (allowed.get(mutation.path) !== expected) return { ok: false };
		if (!cloned.has(mutation.path)) {
			if (!cloneCollectionAtPath(output, mutation.path, expected)) return { ok: false };
			cloned.add(mutation.path);
		}
		const collection = getPath(output, mutation.path);
		if (!applyCollectionMutation(collection, mutation)) return { ok: false };
	}
	return { ok: true, state: output };
}

/** Applies already-validated ordered collection deltas to live reactive state. */
export function commitCollectionMutationsForContract(
	target: Record<string, unknown>,
	mutations: readonly ExactCollectionMutation[],
	contract: StateWriteContract
): boolean {
	const allowed = collectionWritePaths(contract);
	for (const mutation of mutations) {
		const expected = mutation.operation.startsWith('map-') ? 'map' : 'set';
		if (allowed.get(mutation.path) !== expected) return false;
		if (!applyCollectionMutation(getPath(target, mutation.path), mutation)) return false;
	}
	return true;
}

function collectionWritePaths(contract: StateWriteContract): Map<string, 'map' | 'set'> {
	return new Map(
		(contract.writes ?? [])
			.filter(
				(write) =>
					write.kind === 'write' &&
					write.confidence === 'exact' &&
					(write.operation === 'map' || write.operation === 'set')
			)
			.map((write) => [write.path, write.operation as 'map' | 'set'])
	);
}

function cloneCollectionAtPath(
	root: MutableStateContainer,
	path: string,
	kind: 'map' | 'set'
): boolean {
	const segments = path.split('.');
	let source: unknown = root;
	let target: MutableStateContainer = root;
	for (let index = 0; index < segments.length; index++) {
		const segment = segments[index]!;
		if (!isSafeObjectKey(segment) && !isArrayIndex(segment)) return false;
		const next = readContainerValue(source as MutableStateContainer, segment);
		if (index === segments.length - 1) {
			if (kind === 'map' && next instanceof Map) {
				writeContainerValue(target, segment, new Map(next));
				return true;
			}
			if (kind === 'set' && next instanceof Set) {
				writeContainerValue(target, segment, new Set(next));
				return true;
			}
			return false;
		}
		const clone = cloneContainer(next);
		if (!clone) return false;
		writeContainerValue(target, segment, clone);
		source = next;
		target = clone;
	}
	return false;
}

function applyCollectionMutation(value: unknown, mutation: ExactCollectionMutation): boolean {
	switch (mutation.operation) {
		case 'map-set':
			if (!(value instanceof Map)) return false;
			value.set(mutation.key, mutation.value);
			return true;
		case 'map-delete':
			if (!(value instanceof Map)) return false;
			value.delete(mutation.key);
			return true;
		case 'map-clear':
			if (!(value instanceof Map)) return false;
			value.clear();
			return true;
		case 'set-add':
			if (!(value instanceof Set)) return false;
			value.add(mutation.value);
			return true;
		case 'set-delete':
			if (!(value instanceof Set)) return false;
			value.delete(mutation.value);
			return true;
		case 'set-clear':
			if (!(value instanceof Set)) return false;
			value.clear();
			return true;
	}
}

function getPath(value: unknown, path: string): unknown {
	if (path === '*') return value;
	let cursor = value;
	for (const segment of path.split('.')) {
		if (Array.isArray(cursor)) {
			if (!isArrayIndex(segment) || !Object.prototype.hasOwnProperty.call(cursor, segment))
				return undefined;
			cursor = cursor[Number(segment)];
			continue;
		}
		if (!cursor || typeof cursor !== 'object') return undefined;
		if (!isSafeObjectKey(segment) || !Object.prototype.hasOwnProperty.call(cursor, segment))
			return undefined;
		cursor = (cursor as Record<string, unknown>)[segment];
	}
	return cursor;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
	if (path === '*') return;
	const segments = path.split('.');
	if (!segments.every((segment) => isSafeObjectKey(segment) || isArrayIndex(segment))) return;
	let cursor: MutableStateContainer = target;
	for (let index = 0; index < segments.length - 1; index++) {
		const segment = segments[index]!;
		const nextSegment = segments[index + 1]!;
		if (Array.isArray(cursor) && !isArrayIndex(segment)) return;

		const next = readContainerValue(cursor, segment);
		if (!isMutableStateContainer(next)) {
			// Numeric path segments create arrays so contracts like projects.1.id preserve
			// the same shape the server validator expects, even if that means sparse JSON.
			const nextContainer: MutableStateContainer = isArrayIndex(nextSegment) ? [] : {};
			writeContainerValue(cursor, segment, nextContainer);
			cursor = nextContainer;
		} else {
			const nextContainer: MutableStateContainer = Array.isArray(next) ? [...next] : { ...next };
			writeContainerValue(cursor, segment, nextContainer);
			cursor = nextContainer;
		}
	}
	const last = segments[segments.length - 1]!;
	if (Array.isArray(cursor) && !isArrayIndex(last)) return;
	writeContainerValue(cursor, last, value);
}

/** Validates a partial state response against exact writable paths. */
function stateNodeMatchesWrites(value: object, path: string, writes: readonly string[]): boolean {
	for (const key of Object.keys(value)) {
		if (!isSafeObjectKey(key)) return false;
		if (Array.isArray(value) && !isArrayIndex(key)) return false;
		const childPath = path ? `${path}.${key}` : key;
		if (writes.includes(childPath)) continue;
		if (!writes.some((write) => write.startsWith(`${childPath}.`))) return false;
		const child = (value as Record<string, unknown>)[key];
		if (!child || typeof child !== 'object') return false;
		if (!stateNodeMatchesWrites(child, childPath, writes)) return false;
	}
	return true;
}

/** Clones the root container so state commits do not mutate a prior snapshot. */
function cloneContainer(value: unknown): MutableStateContainer | undefined {
	if (Array.isArray(value)) return [...value];
	if (value && typeof value === 'object') return { ...(value as Record<string, unknown>) };
	return undefined;
}

function readContainerValue(container: MutableStateContainer, segment: string): unknown {
	return Array.isArray(container) ? container[Number(segment)] : container[segment];
}

function writeContainerValue(
	container: MutableStateContainer,
	segment: string,
	value: unknown
): void {
	if (Array.isArray(container)) {
		container[Number(segment)] = value;
	} else {
		container[segment] = value;
	}
}

function isMutableStateContainer(value: unknown): value is MutableStateContainer {
	return Boolean(value && typeof value === 'object');
}

function isArrayIndex(segment: string): boolean {
	return /^(0|[1-9]\d*)$/.test(segment);
}
