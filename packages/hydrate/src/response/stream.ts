import { responseResourceBudget, responseGraphLimits } from '../response-resources.js';
import { isExactProgressEvent, type ExactProgressObserver } from './progress.js';
import { matchesOperation } from './operation-identity.js';
import type {
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactOperationResult
} from '@exactjs/core/framework/operation-protocol';
import { publishExactServerObservations } from '@exactjs/core/framework/inspection-transport';
import { decodeBoundedReactiveProtocolValue } from '../protocol-decoding.js';
import {
	isExactStreamCompleteEvent,
	isExactStreamHtmlEvent,
	isExactStreamObservationsEvent,
	isExactStreamMutationsEvent,
	isExactStreamPatchEvent,
	isExactStreamResultEvent,
	isExactStreamStartEvent,
	isExactStreamStateEvent
} from './events.js';
import { type ResponseLimits } from './json.js';
import { isAbortSignal, readNdjsonEvents } from './ndjson.js';
import { parseExactOperationResult } from './result.js';

/** Reads an exact stream response from its source representation. */
export async function readExactStreamResponse(
	response: { body?: ReadableStream<Uint8Array> | null },
	expected: number | readonly ExactInvocationRequest[],
	options:
		| ({
				signal?: AbortSignal;
				maxEvents?: number;
				progress?: readonly (ExactProgressObserver | undefined)[];
		  } & ResponseLimits)
		| AbortSignal = {}
): Promise<ExactOperationResult[]> {
	const message = 'eXact stream invocation returned malformed events';
	if (!response.body) throw new Error(message);
	const expectedOperations = typeof expected === 'number' ? expected : expected.length;
	const expectedList = typeof expected === 'number' ? undefined : expected;
	const selected = isAbortSignal(options) ? { signal: options } : options;
	const normalized = {
		...selected,
		resources: selected.resources ?? responseResourceBudget(selected.logger)
	};
	const results: ExactOperationResult[] = new Array(expectedOperations);
	const chunks: ExactInvocationResult[] = new Array(expectedOperations)
		.fill(undefined)
		.map(() => ({}));
	const stateReceived = new Array<boolean>(expectedOperations).fill(false);
	const mutationsReceived = new Array<boolean>(expectedOperations).fill(false);
	const htmlReceived = new Array<boolean>(expectedOperations).fill(false);

	let started = false;
	let completed = false;
	try {
		await readNdjsonEvents(
			response.body,
			message,
			(rawEvent) => {
				const event = decodeBoundedReactiveProtocolValue(
					rawEvent,
					responseGraphLimits(normalized, normalized.resources, 'stream frame'),
					() => new Error(message)
				);
				if (completed) throw new Error(message);
				if (!started) {
					if (
						!isExactStreamStartEvent(event, normalized) ||
						event.operations !== expectedOperations
					)
						throw new Error(message);
					started = true;
					return;
				}
				if (isExactStreamCompleteEvent(event, normalized)) {
					completed = true;
					return;
				}
				if (isExactStreamObservationsEvent(event, normalized)) {
					publishExactServerObservations(event.observations);
					return;
				}
				if (isExactProgressEvent(event, normalized)) {
					assertStreamIndex(event.index, expectedOperations, message);
					assertStreamOperation(event.index, event, expectedList, message);
					const observer = normalized.progress?.[event.index];
					if (results[event.index] || !normalized.progress) throw new Error(message);
					// Progress is negotiated for the whole request. A plain sibling has no local
					// receiver, so discard its validated snapshot without activating any code.
					if (!observer) return;
					if (!observer.receivers.includes(event.receiver)) throw new Error(message);
					observer.report(event.receiver, event.snapshot);
					return;
				}
				if (isExactStreamPatchEvent(event, normalized)) {
					assertStreamIndex(event.index, expectedOperations, message);
					assertStreamOperation(event.index, event, expectedList, message);
					if (results[event.index]) throw new Error(message);
					const target = chunks[event.index]!;
					normalized.resources(
						'maxPatches',
						normalized.maxPatches,
						10_000,
						(target.patches?.length ?? 0) + 1,
						'assembled operation result',
						'patches'
					);
					target.patches = [...(target.patches ?? []), event.patch];
					return;
				}
				if (isExactStreamStateEvent(event, normalized)) {
					assertStreamIndex(event.index, expectedOperations, message);
					assertStreamOperation(event.index, event, expectedList, message);
					if (results[event.index] || stateReceived[event.index]) throw new Error(message);
					stateReceived[event.index] = true;
					chunks[event.index]!.state = event.value;
					if (event.statePaths !== undefined) chunks[event.index]!.statePaths = event.statePaths;
					return;
				}
				if (
					event &&
					typeof event === 'object' &&
					(event as { event?: unknown }).event === 'mutations'
				) {
					const index = (event as { index: number }).index;
					assertStreamIndex(index, expectedOperations, message);
					if (
						expectedList &&
						!matchesOperation(event as Record<string, unknown>, expectedList[index]!)
					)
						throw new Error(message);
					const selected = {
						...normalized,
						arrayCompletion: normalized.arrayCompletions
							? normalized.arrayCompletions[index]
							: expectedOperations === 1
								? normalized.arrayCompletion
								: undefined,
						arrayCompletions: undefined
					};
					if (!isExactStreamMutationsEvent(event, selected)) throw new Error(message);
					assertStreamIndex(event.index, expectedOperations, message);
					assertStreamOperation(event.index, event, expectedList, message);
					if (results[event.index] || mutationsReceived[event.index]) throw new Error(message);
					mutationsReceived[event.index] = true;
					chunks[event.index]!.mutations = event.mutations;
					return;
				}
				if (isExactStreamHtmlEvent(event, normalized)) {
					assertStreamIndex(event.index, expectedOperations, message);
					assertStreamOperation(event.index, event, expectedList, message);
					if (results[event.index] || htmlReceived[event.index]) throw new Error(message);
					htmlReceived[event.index] = true;
					chunks[event.index]!.html = event.html;
					return;
				}
				if (isExactStreamResultEvent(event, normalized)) {
					assertStreamIndex(event.index, expectedOperations, message);
					if (results[event.index]) throw new Error(message);
					const result = parseExactOperationResult(event.result, expectedList?.[event.index], {
						...normalized,
						arrayCompletion: normalized.arrayCompletions
							? normalized.arrayCompletions[event.index]
							: expectedOperations === 1
								? normalized.arrayCompletion
								: undefined,
						arrayCompletions: undefined
					});
					if (result.ok)
						normalized.resources(
							'maxPatches',
							normalized.maxPatches,
							10_000,
							(result.patches?.length ?? 0) + (chunks[event.index]!.patches?.length ?? 0),
							'assembled operation result',
							'patches'
						);
					if (
						result.ok &&
						(('state' in result && stateReceived[event.index]) ||
							(result.mutations !== undefined && mutationsReceived[event.index]) ||
							(result.html !== undefined && htmlReceived[event.index]))
					)
						throw new Error(message);
					normalized.progress?.[event.index]?.close();
					const streamed = chunks[event.index]!;
					results[event.index] = result.ok
						? {
								...result,
								...streamed,
								...(streamed.patches
									? { patches: [...streamed.patches, ...(result.patches ?? [])] }
									: {})
							}
						: result;
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
	} finally {
		for (const observer of normalized.progress ?? []) observer?.close();
	}
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

/** Validates stream index and throws when the contract is violated. */
export function assertStreamIndex(
	index: number,
	expectedOperations: number,
	message: string
): void {
	if (!Number.isInteger(index) || index < 0 || index >= expectedOperations)
		throw new Error(message);
}
