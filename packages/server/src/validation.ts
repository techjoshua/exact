import type { ArrayNetMutation, ArrayServerBinding } from '@exactjs/reactive/framework/array-patch';
import { responseResourceBudget, responseGraphLimits } from './response-resources.js';
import type { ResponseResourceBudget } from '@exactjs/core/framework/protocol-records';
import { stateNodeMatchesWrites } from '@exactjs/core/framework/protocol-records';
import { ownRegistryEntry } from './registry-entry.js';
import { hasOnlyKeys, isJsonSafe } from './protocol.js';
import {
	isStateDeletionList,
	isStateOutputPathList,
	minimalStateReadPaths
} from '@exactjs/core/framework/protocol-records';
import { isSafeProtocolKey as isSafeObjectKey } from '@exactjs/core/framework/protocol-records';
import { isSafeDomPatchProperty } from '@exactjs/core/framework/operation-protocol';
import type {
	ExactExecutorContract,
	ExactServerContext,
	ExactCollectionMutation,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactPatch,
	ExactStatePath
} from './types.js';

/** Returns whether an invocation references an entry in the composed executor allowlist. */
export function isExecutorAllowed(
	input: ExactInvocationRequest,
	contract: ExactExecutorContract
): boolean {
	if (input.type === 'invoke') return Boolean(ownRegistryEntry(contract.invocations, input.id));
	if (input.type === 'refresh') return Boolean(ownRegistryEntry(contract.boundaries, input.id));
	return false;
}

/** Validates result shape and serialization safety. Omitted resource settings warn, explicit positive caps throw ResponseResourceLimitError. Invalid graphs and unauthorized shapes remain false. */
export function isInvocationResultSafe(
	result: unknown,
	limits: {
		maxJsonDepth?: number;
		maxJsonNodes?: number;
		maxResponseBytes?: number;
		maxPatches?: number;
	} = {},
	resources: ResponseResourceBudget = responseResourceBudget(),
	arrayParser?: (value: unknown) => ArrayNetMutation
): result is ExactInvocationResult {
	if (!isJsonSafe(result, responseGraphLimits(limits, resources, 'operation result'))) return false;
	if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
	const record = result as Record<string, unknown>;
	if (
		!hasOnlyKeys(record, [
			'arrayCompletion',
			'patches',
			'state',
			'statePaths',
			'mutations',
			'deletions',
			'contexts',
			'html',
			'value'
		])
	)
		return false;
	if (record.arrayCompletion !== undefined && record.arrayCompletion !== 4) return false;
	if ('state' in record && record.state === undefined) return false;
	if (
		'statePaths' in record &&
		(!Object.hasOwn(record, 'state') || !isStateOutputPathList(record.statePaths))
	)
		return false;
	if (
		record.contexts !== undefined &&
		(!record.contexts || typeof record.contexts !== 'object' || Array.isArray(record.contexts))
	)
		return false;
	if (record.patches !== undefined) {
		if (!Array.isArray(record.patches)) return false;
		resources(
			'maxPatches',
			limits.maxPatches,
			10_000,
			record.patches.length,
			'operation result',
			'patches'
		);
		if (!record.patches.every(isPatchSafe)) return false;
	}
	if (
		record.mutations !== undefined &&
		(!Array.isArray(record.mutations) ||
			!record.mutations.every((value) => isCollectionMutationSafe(value, arrayParser)))
	)
		return false;
	if (record.html !== undefined && typeof record.html !== 'string') return false;
	if (record.deletions !== undefined && !isStateDeletionList(record.deletions)) return false;
	return true;
}

/** Returns whether collection deltas target exact compiler-authorized collection writes. */
export function collectionMutationsMatchContract(
	mutations: readonly ExactCollectionMutation[] | undefined,
	writes: readonly ExactStatePath[]
): boolean {
	if (!mutations) return true;
	const allowed = new Map(
		writes
			.filter(
				(write) =>
					write.kind === 'write' &&
					write.confidence === 'exact' &&
					(write.operation === 'map' || write.operation === 'set')
			)
			.map((write) => [write.path, write.operation])
	);
	return mutations.every((mutation) => {
		if (mutation.operation === 'array-net')
			return writes.some(
				(write) =>
					write.kind === 'write' &&
					write.confidence === 'exact' &&
					write.path === mutation.path &&
					write.arrayRoots?.some((root) => root.path.join('.') === write.path)
			);
		const kind = mutation.operation.startsWith('map-') ? 'map' : 'set';
		return allowed.get(mutation.path) === kind;
	});
}

function isCollectionMutationSafe(
	value: unknown,
	arrayParser?: (value: unknown) => ArrayNetMutation
): value is ExactCollectionMutation {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	if (typeof record.path !== 'string' || !record.path.split('.').every(isSafeObjectKey))
		return false;
	switch (record.operation) {
		case 'array-net':
			if (!arrayParser) return false;
			try {
				arrayParser(value);
				return true;
			} catch {
				return false;
			}
		case 'map-set':
			return (
				hasOnlyKeys(record, ['path', 'operation', 'key', 'value']) &&
				isTransportableMapKey(record.key) &&
				'value' in record
			);
		case 'map-delete':
			return hasOnlyKeys(record, ['path', 'operation', 'key']) && isTransportableMapKey(record.key);
		case 'map-clear':
		case 'set-clear':
			return hasOnlyKeys(record, ['path', 'operation']);
		case 'set-add':
		case 'set-delete':
			return hasOnlyKeys(record, ['path', 'operation', 'value']) && 'value' in record;
		default:
			return false;
	}
}

function isTransportableMapKey(value: unknown): boolean {
	return (
		value === null ||
		typeof value === 'boolean' ||
		typeof value === 'string' ||
		(typeof value === 'number' && Number.isFinite(value))
	);
}

/** Returns whether submitted boundary snapshots are allowed for the invocation. */
export function boundaryHintsAllowed(
	input: ExactInvocationRequest,
	contract: ExactExecutorContract
): boolean {
	if (!input.boundaryHtmls) return true;
	if (input.type === 'invoke') {
		const allowed = ownRegistryEntry(contract.invocations, input.id)?.boundaries;
		if (allowed) {
			const allowedSet = new Set(allowed);
			return Object.keys(input.boundaryHtmls).every((id) => allowedSet.has(id));
		}
	}
	for (const id of Object.keys(input.boundaryHtmls)) {
		if (!ownRegistryEntry(contract.boundaries, id)) return false;
	}
	return true;
}

/** Checks required input snapshots, coalescing descendant reads already supplied by a complete enclosing value. */
export function stateMatchesContract(state: unknown, reads: readonly ExactStatePath[]): boolean {
	for (const path of minimalStateReadPaths(reads)) {
		if (!hasStatePath(state, path)) return false;
	}
	return true;
}

/**
 * Returns whether a continuation response contains only compiler-authorized
 * state writes. Exact parent paths authorize their complete JSON subtree;
 * absent paths are allowed because control flow may skip a declared write.
 */
export function stateResponseMatchesContract(
	state: unknown,
	writes: readonly ExactStatePath[],
	paths?: readonly string[]
): boolean {
	if (state === undefined) return true;
	const selected =
		paths ??
		writes
			.filter((write) => write.kind === 'write' && write.confidence === 'exact')
			.map((write) => write.path);
	for (let index = 0; index < selected.length; index++) if (selected[index] === '*') return true;
	if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
	return stateNodeMatchesWrites(state, '', selected);
}

/** Validates only explicitly public context projections transported by the client. */
export function publicContextMatchesContract(
	context: Record<string, unknown> | undefined,
	tokens: readonly string[]
): boolean {
	if (!context) return tokens.length === 0;
	if (!tokens.length) return false;
	const allowed = new Set(tokens);
	if (!Object.keys(context).every((token) => allowed.has(token))) return false;
	for (const token of tokens)
		if (!Object.prototype.hasOwnProperty.call(context, token)) return false;
	return true;
}

/** Validates that a response contains only compiler-authorized component-context writes. */
export function contextResponseMatchesContract(
	contexts: Record<string, unknown> | undefined,
	tokens: readonly string[]
): boolean {
	if (!contexts) return true;
	const allowed = new Set(tokens);
	return Object.keys(contexts).every((token) => allowed.has(token));
}

function isPatchSafe(patch: unknown): patch is ExactPatch {
	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
	const record = patch as Record<string, unknown>;
	if (typeof record.type !== 'string' || typeof record.id !== 'string' || !record.id) return false;

	switch (record.type) {
		case 'text':
			return hasOnlyKeys(record, ['type', 'id', 'value']) && typeof record.value === 'string';
		case 'prop':
			return (
				hasOnlyKeys(record, ['type', 'id', 'name', 'value']) &&
				typeof record.name === 'string' &&
				isSafeDomPatchProperty(record.name) &&
				Object.hasOwn(record, 'value')
			);
		case 'style':
			return (
				hasOnlyKeys(record, ['type', 'id', 'name', 'value']) &&
				typeof record.name === 'string' &&
				(typeof record.value === 'string' || record.value === null)
			);
		case 'list':
			return (
				hasOnlyKeys(record, ['type', 'id', 'op', 'key', 'before', 'html']) &&
				typeof record.key === 'string' &&
				(record.op === 'insert' || record.op === 'move' || record.op === 'remove') &&
				(record.before === undefined || typeof record.before === 'string') &&
				(record.html === undefined || typeof record.html === 'string')
			);
		case 'state':
			return hasOnlyKeys(record, ['type', 'id', 'value']) && Object.hasOwn(record, 'value');
		case 'replace':
			return hasOnlyKeys(record, ['type', 'id', 'html']) && typeof record.html === 'string';
		default:
			return false;
	}
}

function hasStatePath(value: unknown, path: string): boolean {
	if (path === '*') return value !== undefined;
	let cursor = value;
	for (const segment of path.split('.')) {
		if (Array.isArray(cursor)) {
			if (!isArrayIndex(segment) || !Object.prototype.hasOwnProperty.call(cursor, segment))
				return false;
			cursor = cursor[Number(segment)];
			continue;
		}
		if (!cursor || typeof cursor !== 'object') return false;
		if (!isSafeObjectKey(segment)) return false;
		if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return false;
		cursor = (cursor as Record<string, unknown>)[segment];
	}
	return true;
}

function isArrayIndex(segment: string): boolean {
	return /^(0|[1-9]\d*)$/.test(segment);
}

/** Checks the finite discriminator against its admitted partition boundary. */
export function partitionDiscriminatorMatchesBoundary(
	authority: NonNullable<ExactInvocationRequest['partition']>,
	boundary: ExactServerContext['contract']['boundaries'][string]
): boolean {
	const discriminator = authority.discriminator;
	if (discriminator.kind === 'single') return true;
	if (discriminator.kind === 'branch')
		return boundary.discriminatorValues?.includes(discriminator.branch) === true;
	return discriminator.list === boundary.parentPlanId;
}

/** Measures compact sequence materialization with the existing response resource policy before apply. */
export function arrayResponseParser(
	binding: ArrayServerBinding | undefined,
	maxJsonNodes: number | undefined,
	resources: ResponseResourceBudget
): ((value: unknown) => ArrayNetMutation) | undefined {
	if (!binding) return;
	return (value) =>
		binding.parse(value, (slots) =>
			resources(
				'maxJsonNodes',
				maxJsonNodes,
				100_000,
				slots,
				'Array completion sequence',
				'materialized slots'
			)
		);
}

/** Compares the complete admitted partition authority, including its generation and discriminator. */
export function samePartitionAuthority(
	left: NonNullable<ExactInvocationRequest['partition']>,
	right: NonNullable<ExactInvocationRequest['partition']>
): boolean {
	const leftDiscriminator = left.discriminator;
	const rightDiscriminator = right.discriminator;
	const sameDiscriminator =
		leftDiscriminator.kind === rightDiscriminator.kind &&
		(leftDiscriminator.kind === 'single' ||
			(leftDiscriminator.kind === 'branch' &&
				rightDiscriminator.kind === 'branch' &&
				leftDiscriminator.branch === rightDiscriminator.branch) ||
			(leftDiscriminator.kind === 'keyed' &&
				rightDiscriminator.kind === 'keyed' &&
				leftDiscriminator.list === rightDiscriminator.list &&
				leftDiscriminator.keyToken === rightDiscriminator.keyToken));
	return (
		left.version === right.version &&
		left.buildKey === right.buildKey &&
		left.executionRoot === right.executionRoot &&
		left.planEdgeId === right.planEdgeId &&
		left.ownerComponentId === right.ownerComponentId &&
		left.generation === right.generation &&
		sameDiscriminator
	);
}
