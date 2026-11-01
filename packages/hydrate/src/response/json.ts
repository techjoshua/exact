import type { ArrayNetMutation } from '@exactjs/reactive/framework/array-patch';
import type { Logger } from '@exactjs/core';
import type { ResponseResourceBudget } from '@exactjs/core/framework/protocol-records';
import { responseResourceBudget, responseGraphLimits } from '../response-resources.js';
import type {
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactPatch
} from '@exactjs/core/framework/operation-protocol';
import { hasOnlyKeys } from '../validation.js';
import {
	isStateDeletionList,
	isStateOutputPathList
} from '@exactjs/core/framework/protocol-records';
import { decodeBoundedReactiveProtocolValue } from '../protocol-decoding.js';
import { isCollectionMutationLike, isPatchLike } from './patch-validation.js';
import { matchesOperation } from './operation-identity.js';

/** Parser selected from one admitted artifact, never inherited by a batch sibling. */
export type ArrayResponseContext = Readonly<{
	version: 4;
	parse(value: unknown, onSequenceSlots?: (slots: number) => void): ArrayNetMutation;
}>;

/** Defines the response limits type contract. */
export type ResponseLimits = {
	arrayCompletion?: ArrayResponseContext;
	arrayCompletions?: readonly (ArrayResponseContext | undefined)[];
	logger?: Logger;
	resources?: ResponseResourceBudget;
	maxBytes?: number;
	maxJsonDepth?: number;
	maxJsonNodes?: number;
	maxPatches?: number;
};

/** Reads an exact invocation response from its source representation. */
export function parseExactInvocationResponse(
	body: unknown,
	message: string,
	expected?: ExactInvocationRequest,
	limits: ResponseLimits = {}
): ExactInvocationResult {
	limits = { ...limits, resources: limits.resources ?? responseResourceBudget(limits.logger) };
	body = decodeBoundedReactiveProtocolValue(
		body,
		responseGraphLimits(limits, limits.resources!, 'buffered response graph'),
		() => new Error(message)
	);
	return parseDecodedInvocationResponse(body, message, expected, limits);
}

/** Validates an already bounded and decoded record without reinterpreting literal tags or collections. */
export function parseDecodedInvocationResponse(
	body: unknown,
	message: string,
	expected?: ExactInvocationRequest,
	limits: ResponseLimits = {}
): ExactInvocationResult {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(message);
	const record = body as Record<string, unknown>;
	if (record.ok !== true) throw new Error(message);
	if (
		!hasOnlyKeys(record, [
			'ok',
			'type',
			'id',
			'opId',
			'arrayCompletion',
			'patches',
			'state',
			'statePaths',
			'mutations',
			'deletions',
			'contexts',
			'value',
			'html'
		])
	)
		throw new Error(message);
	if (expected && !matchesOperation(record, expected)) throw new Error(message);
	if (
		record.arrayCompletion !== expected?.arrayCompletion ||
		(expected?.arrayCompletion !== undefined &&
			limits.arrayCompletion?.version !== expected.arrayCompletion)
	)
		throw new Error(message);
	if ('state' in record && record.state === undefined) throw new Error(message);
	if (
		'statePaths' in record &&
		(!Object.hasOwn(record, 'state') || !isStateOutputPathList(record.statePaths))
	)
		throw new Error(message);
	if (
		record.contexts !== undefined &&
		(!record.contexts || typeof record.contexts !== 'object' || Array.isArray(record.contexts))
	)
		throw new Error(message);
	if (
		record.patches !== undefined &&
		(!Array.isArray(record.patches) || !record.patches.every(isPatchLike))
	)
		throw new Error(message);
	if (
		record.mutations !== undefined &&
		(!Array.isArray(record.mutations) ||
			!record.mutations.every((value) => isCollectionMutationLike(value, limits)))
	)
		throw new Error(message);
	if (Array.isArray(record.patches))
		(limits.resources ?? responseResourceBudget(limits.logger))(
			'maxPatches',
			limits.maxPatches,
			10_000,
			record.patches.length,
			'operation result',
			'patches'
		);
	if (record.html !== undefined && typeof record.html !== 'string') throw new Error(message);
	if (record.deletions !== undefined && !isStateDeletionList(record.deletions))
		throw new Error(message);
	return {
		...(record.arrayCompletion === 4 ? { arrayCompletion: 4 as const } : {}),
		...(record.patches === undefined ? {} : { patches: record.patches as ExactPatch[] }),
		...('state' in record ? { state: record.state } : {}),
		...('statePaths' in record ? { statePaths: record.statePaths as string[] } : {}),
		...(record.mutations === undefined ? {} : { mutations: record.mutations }),
		...(record.deletions === undefined ? {} : { deletions: record.deletions as string[] }),
		...(record.contexts === undefined
			? {}
			: { contexts: record.contexts as Record<string, unknown> }),
		...('value' in record ? { value: record.value } : {}),
		...(record.html === undefined ? {} : { html: record.html })
	};
}
