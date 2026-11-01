import {
	stateNodeMatchesWrites,
	stateDeletionPathsMatchWrites,
	stateOutputPathsMatchWrites,
	minimalStateReadPaths
} from '@exactjs/core/framework/protocol-records';
import type {
	ExactCollectionMutation,
	ExactContinuationStatePathContract
} from '@exactjs/core/framework/component-contracts';
import { hasOnlySafeProtocolKeys } from '@exactjs/core/framework/protocol-records';
import { isSafeObjectKey } from './safety.js';
import type { ExactInvocationResult } from './types.js';

type MutableStateContainer = Record<string, unknown> | unknown[];
/** Distinguishes absent paths from owned values without allocating a result for each traversal. */
const missingPath = Symbol('missing state path');
type StateReadContract = {
	readonly reads?: readonly ExactContinuationStatePathContract[];
};
type StateWriteContract = {
	readonly writes?: readonly ExactContinuationStatePathContract[];
};

/** Captures required value reads without mutating client state. Missing leaves become undefined, while enclosing snapshots retain presence and missing containers remain invalid. */
export function stateForContract(
	state: unknown,
	contract: StateReadContract | undefined,
	read?: (receiver: object, key: string) => unknown
): unknown {
	if (!contract) return state;
	const reads = minimalStateReadPaths(contract.reads ?? []);
	if (!reads.length) return undefined;
	if (reads.includes('*')) return state;
	const output: Record<string, unknown> = {};
	for (const path of reads) {
		const value = getPath(state, path, true, read);
		if (value !== missingPath) updatePath(output, path, value);
	}
	return Object.keys(output).length ? output : undefined;
}

/** Plans all continuation state changes against one snapshot before publication. Invalid scalar, deletion, or collection authority rejects the complete state result without mutating live receivers. No state changes produce no plan. */
export function mergeStatePublicationForContract(
	state: unknown,
	result: Pick<ExactInvocationResult, 'state' | 'statePaths' | 'deletions' | 'mutations'>,
	contract: StateWriteContract
): { ok: true; state: unknown } | { ok: false } | undefined {
	const merged =
		'state' in result || result.deletions?.length
			? mergeStateForContract(state, result.state, contract, result.deletions, result.statePaths)
			: undefined;
	if (merged?.ok === false || !result.mutations) return merged;
	return mergeCollectionMutationsForContract(
		merged?.ok ? merged.state : state,
		result.mutations,
		contract
	);
}

/**
 * Validates and merges the partial state returned by a continuation.
 *
 * The returned object may contain only exact compiler-declared write paths.
 * Parent writes replace their complete subtree; unrelated client state is
 * retained. A wildcard write deliberately authorizes full replacement. Explicit authorized deletions remove
 * properties, while omitted conditional writes leave them unchanged. Snapshot deletion retains
 * unrelated state and array length. Explicit statePaths select the performed outputs independently
 * of potential parent writes and must remain within the supplied authority.
 */
export function mergeStateForContract(
	state: unknown,
	update: unknown,
	contract: StateWriteContract,
	deletions: readonly string[] = [],
	statePaths?: readonly string[]
): { ok: true; state: unknown } | { ok: false } {
	if (!stateDeletionPathsMatchWrites(deletions, contract.writes ?? [])) return { ok: false };
	const paths = stateWritePaths(contract, statePaths);
	if (!paths) return { ok: false };
	if (paths.includes('*') && update !== undefined) {
		if (!hasOnlySafeProtocolKeys(update)) return { ok: false };
		if (!deletions.length) return { ok: true, state: update };
		const output = cloneContainer(update);
		if (!output) return { ok: false };
		for (let index = 0; index < deletions.length; index++)
			updatePath(
				output as Record<string, unknown>,
				deletions[index]!,
				undefined,
				'snapshot',
				'delete'
			);
		return { ok: true, state: output };
	}
	if (
		update === undefined
			? !deletions.length
			: !update || typeof update !== 'object' || Array.isArray(update)
	)
		return { ok: false };
	if (update !== undefined && !stateNodeMatchesWrites(update as object, '', paths))
		return { ok: false };

	let output = cloneContainer(state);
	for (const path of paths) {
		const value = getPath(update, path);
		if (value === missingPath) continue;
		if (!output) output = {};
		updatePath(output as Record<string, unknown>, path, value);
	}
	if (deletions.length && !output) return { ok: false };
	for (let index = 0; index < deletions.length; index++)
		updatePath(
			output as Record<string, unknown>,
			deletions[index]!,
			undefined,
			'snapshot',
			'delete'
		);
	return { ok: true, state: output ?? state };
}

/** Commits validated sets and deletions into live reactive receivers, retaining container identity and rejecting unauthorized deletion paths. */
export function commitStateForContract(
	target: Record<string, unknown>,
	update: unknown,
	contract: StateWriteContract,
	deletions: readonly string[] = [],
	statePaths?: readonly string[]
): void {
	if (!stateDeletionPathsMatchWrites(deletions, contract.writes ?? [])) return;
	const paths = stateWritePaths(contract, statePaths);
	if (!paths) return;
	if (paths.includes('*') && update !== undefined) {
		if (!update || typeof update !== 'object' || Array.isArray(update)) return;
		if (!hasOnlySafeProtocolKeys(update)) return;
		for (const key of Object.keys(target))
			if (!Object.prototype.hasOwnProperty.call(update, key)) delete target[key];
		for (const key of Object.keys(update)) target[key] = (update as Record<string, unknown>)[key];
	} else
		for (const path of paths) {
			const value = getPath(update, path);
			if (value !== missingPath) updatePath(target, path, value, 'live');
		}
	for (let index = 0; index < deletions.length; index++)
		updatePath(target, deletions[index]!, undefined, 'live', 'delete');
}

/** Selects performed value outputs under compiler authority. Omitted selections use complete declared snapshot paths. Owned lists are copied by index so caller iteration hooks cannot enter publication. */
function stateWritePaths(
	contract: StateWriteContract,
	selected?: readonly string[]
): readonly string[] | undefined {
	const writes = contract.writes ?? [];
	if (selected === undefined)
		return writes
			.filter((write) => write.kind === 'write' && write.confidence === 'exact')
			.map((write) => write.path);
	if (!stateOutputPathsMatchWrites(selected, writes)) return undefined;
	const paths: string[] = [];
	for (let index = 0; index < selected.length; index++) paths.push(selected[index]!);
	return paths;
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
		if (!applyPreparedCollectionMutation(collection, mutation)) return { ok: false };
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
		if (!applyPreparedCollectionMutation(getPath(target, mutation.path), mutation)) return false;
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

/** Applies one prevalidated Map or Set delta to its once-prepared receiver. */
export function applyPreparedCollectionMutation(
	value: unknown,
	mutation: ExactCollectionMutation
): boolean {
	switch (mutation.operation) {
		case 'array-net':
			return false;
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

function getPath(
	value: unknown,
	path: string,
	absentLeaf = false,
	read?: (receiver: object, key: string) => unknown
): unknown {
	if (path === '*') return value;
	let cursor = value;
	const segments = path.split('.');
	for (let index = 0; index < segments.length; index++) {
		const segment = segments[index]!;
		if (!cursor || typeof cursor !== 'object') return missingPath;
		if (Array.isArray(cursor) ? !isArrayIndex(segment) : !isSafeObjectKey(segment))
			return missingPath;
		if (!Object.hasOwn(cursor, segment))
			return absentLeaf && index === segments.length - 1 && !Reflect.has(cursor, segment)
				? undefined
				: missingPath;
		cursor = read
			? read(cursor, Array.isArray(cursor) ? String(Number(segment)) : segment)
			: readContainerValue(cursor as MutableStateContainer, segment);
	}
	return cursor;
}

/** Sets create missing containers. Deletes leave missing paths alone. Snapshots copy ancestors while live commits retain receiver identity. */
function updatePath(
	target: Record<string, unknown>,
	path: string,
	value: unknown,
	mode: 'snapshot' | 'live' = 'snapshot',
	operation: 'set' | 'delete' = 'set'
): void {
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
			if (operation === 'delete') return;
			// Numeric path segments create arrays so contracts like projects.1.id preserve
			// the same shape the server validator expects, even if that means sparse JSON.
			const nextContainer: MutableStateContainer = isArrayIndex(nextSegment) ? [] : {};
			writeContainerValue(cursor, segment, nextContainer);
			// Re-read a live assignment because the receiver may wrap the inserted object.
			cursor =
				mode === 'live'
					? (readContainerValue(cursor, segment) as MutableStateContainer)
					: nextContainer;
		} else if (mode === 'live') {
			cursor = next;
		} else {
			const nextContainer = cloneContainer(next)!;
			writeContainerValue(cursor, segment, nextContainer);
			cursor = nextContainer;
		}
	}
	const last = segments[segments.length - 1]!;
	if (Array.isArray(cursor) && !isArrayIndex(last)) return;
	if (operation === 'delete') {
		if (!Reflect.deleteProperty(cursor, last))
			throw new TypeError(`Cannot delete state property ${path}`);
	} else writeContainerValue(cursor, last, value);
}

/** Copies containers without filling sparse slots or invoking array iteration/species hooks. */
function cloneContainer(value: unknown): MutableStateContainer | undefined {
	if (Array.isArray(value)) {
		const copy = new Array<unknown>(value.length);
		for (let index = 0; index < value.length; index++)
			if (index in value) copy[index] = value[index];
		return copy;
	}
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
