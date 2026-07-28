import { decodeReactiveProtocolValue } from '@exactjs/core';
import type {
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactOperationResult
} from '@exactjs/server';
import { isJsonSafe } from '../validation.js';
import {
	isExactStreamCompleteEvent,
	isExactStreamHtmlEvent,
	isExactStreamMutationsEvent,
	isExactStreamPatchEvent,
	isExactStreamResultEvent,
	isExactStreamStartEvent,
	isExactStreamStateEvent
} from './events.js';
import { type ResponseLimits } from './json.js';
import { isAbortSignal, positiveLimit, readNdjsonEvents } from './ndjson.js';
import { parseExactOperationResult } from './result.js';

/** Reads an exact stream response from its source representation. */
export async function readExactStreamResponse(
	response: { body?: ReadableStream<Uint8Array> | null },
	expected: number | readonly ExactInvocationRequest[],
	options: ({ signal?: AbortSignal; maxEvents?: number } & ResponseLimits) | AbortSignal = {}
): Promise<ExactOperationResult[]> {
	const message = 'eXact stream invocation returned malformed events';
	if (!response.body) throw new Error(message);
	const expectedOperations = typeof expected === 'number' ? expected : expected.length;
	const expectedList = typeof expected === 'number' ? undefined : expected;
	const normalized = isAbortSignal(options) ? { signal: options } : options;
	const results: ExactOperationResult[] = new Array(expectedOperations);
	const chunks: ExactInvocationResult[] = new Array(expectedOperations)
		.fill(undefined)
		.map(() => ({}));
	const stateReceived = new Array<boolean>(expectedOperations).fill(false);
	const mutationsReceived = new Array<boolean>(expectedOperations).fill(false);
	const htmlReceived = new Array<boolean>(expectedOperations).fill(false);
	const maxPatches = positiveLimit(normalized.maxPatches, 10_000);
	let started = false;
	let completed = false;
	await readNdjsonEvents(
		response.body,
		message,
		(rawEvent) => {
			if (
				!isJsonSafe(rawEvent, {
					maxDepth: normalized.maxJsonDepth,
					maxNodes: normalized.maxJsonNodes,
					maxBytes: normalized.maxBytes
				})
			)
				throw new Error(message);
			let event: unknown;
			try {
				event = decodeReactiveProtocolValue(rawEvent);
			} catch {
				throw new Error(message);
			}
			if (
				!isJsonSafe(event, {
					maxDepth: normalized.maxJsonDepth,
					maxNodes: normalized.maxJsonNodes,
					maxBytes: normalized.maxBytes
				})
			)
				throw new Error(message);
			if (completed) throw new Error(message);
			if (!started) {
				if (!isExactStreamStartEvent(event) || event.operations !== expectedOperations)
					throw new Error(message);
				started = true;
				return;
			}
			if (isExactStreamCompleteEvent(event)) {
				completed = true;
				return;
			}
			if (isExactStreamPatchEvent(event)) {
				assertStreamIndex(event.index, expectedOperations, message);
				assertStreamOperation(event.index, event, expectedList, message);
				if (results[event.index]) throw new Error(message);
				const target = chunks[event.index]!;
				if ((target.patches?.length ?? 0) >= maxPatches) throw new Error(message);
				target.patches = [...(target.patches ?? []), event.patch];
				return;
			}
			if (isExactStreamStateEvent(event)) {
				assertStreamIndex(event.index, expectedOperations, message);
				assertStreamOperation(event.index, event, expectedList, message);
				if (results[event.index] || stateReceived[event.index]) throw new Error(message);
				stateReceived[event.index] = true;
				chunks[event.index]!.state = event.value;
				return;
			}
			if (isExactStreamMutationsEvent(event)) {
				assertStreamIndex(event.index, expectedOperations, message);
				assertStreamOperation(event.index, event, expectedList, message);
				if (results[event.index] || mutationsReceived[event.index]) throw new Error(message);
				mutationsReceived[event.index] = true;
				chunks[event.index]!.mutations = event.mutations;
				return;
			}
			if (isExactStreamHtmlEvent(event)) {
				assertStreamIndex(event.index, expectedOperations, message);
				assertStreamOperation(event.index, event, expectedList, message);
				if (results[event.index] || htmlReceived[event.index]) throw new Error(message);
				htmlReceived[event.index] = true;
				chunks[event.index]!.html = event.html;
				return;
			}
			if (isExactStreamResultEvent(event)) {
				assertStreamIndex(event.index, expectedOperations, message);
				if (results[event.index]) throw new Error(message);
				const result = parseExactOperationResult(
					event.result,
					expectedList?.[event.index],
					normalized
				);
				if (
					result.ok &&
					(result.patches?.length ?? 0) + (chunks[event.index]!.patches?.length ?? 0) > maxPatches
				)
					throw new Error(message);
				if (
					result.ok &&
					(('state' in result && stateReceived[event.index]) ||
						(result.html !== undefined && htmlReceived[event.index]))
				)
					throw new Error(message);
				results[event.index] = result.ok ? { ...result, ...chunks[event.index] } : result;
				return;
			}
			throw new Error(message);
		},
		normalized
	);
	if (!started || !completed) throw new Error(message);
	for (let index = 0; index < expectedOperations; index++) {
		if (!results[index]) throw new Error(message);
	}
	return results;
}

/** Validates stream operation and throws when the contract is violated. */
export function assertStreamOperation(
	index: number,
	actual: { type: unknown; id: unknown; opId?: string },
	expected: readonly ExactInvocationRequest[] | undefined,
	message: string
): void {
	if (expected && !matchesOperation(actual as Record<string, unknown>, expected[index]!))
		throw new Error(message);
}

/** Reports whether operation. */
export function matchesOperation(
	record: Record<string, unknown>,
	expected: ExactInvocationRequest
): boolean {
	return (
		record.type === expected.type && record.id === expected.id && record.opId === expected.opId
	);
}

/** Validates stream index and throws when the contract is violated. */
export function assertStreamIndex(
	index: number,
	expectedOperations: number,
	message: string
): void {
	if (!Number.isInteger(index) || index < 0 || index >= expectedOperations)
		throw new Error(message);
}
