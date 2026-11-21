import { arrayScalarWrites, arrayScalarOutputPaths } from './array-completion.js';
import type { ArrayBefore } from '@exactjs/reactive/framework/array-diff';
import type { ExactCollectionMutation } from '@exactjs/core/framework/component-contracts';
import { unwrap } from '@exactjs/core';
import { prepareContinuationWriteContainers } from './write-containers.js';
import { warnUnavailableTaskProgress } from '../progress/capability.js';
import type {
	ExactComponentContinuationContract,
	ExactComponentContinuationExecutorContract
} from '@exactjs/core/framework/component-contracts';
import {
	discardTaskMutations,
	publishTaskMutations,
	takeTaskCollectionMutations
} from '@exactjs/core';
import {
	attachTaskProgressReporter,
	captureTaskPropertyMutations,
	runTaskFrame,
	takeTaskPropertyMutations
} from '@exactjs/core/framework/task-frames';
import type {
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactServerContext
} from '../types.js';

/** Application-compatible handler generated from one compiler-owned continuation executor. */
export type ExactGeneratedContinuationHandler = (
	input: ExactInvocationRequest,
	context: ExactServerContext
) => Promise<ExactInvocationResult>;

/** Prepared handlers belong to both their authority contract and executable implementation. */
const generatedHandlers = new WeakMap<
	ExactComponentContinuationContract,
	{
		executor: ExactComponentContinuationExecutorContract;
		handler: ExactGeneratedContinuationHandler;
	}
>();

/**
 * Creates the server MoveNext segment for a compiler-generated continuation.
 *
 * The executor receives only validated dependency snapshots, request-local
 * state, explicitly public context, and trusted server context lookups. Its
 * state result is projected back down to declared write paths.
 */
export function createExactContinuationHandler(
	contract: ExactComponentContinuationContract,
	executor: ExactComponentContinuationExecutorContract
): ExactGeneratedContinuationHandler {
	if (contract.id !== executor.id || contract.componentId !== executor.componentId)
		throw new Error(`Mismatched eXact continuation executor ${executor.id}`);
	const cached = generatedHandlers.get(contract);
	if (cached?.executor === executor) return cached.handler;
	const writePaths = contract.stateWrites
		.filter(
			(write) =>
				write.kind === 'write' &&
				write.confidence === 'exact' &&
				write.operation !== 'map' &&
				write.operation !== 'set'
		)
		.map((write) => write.path);
	const collectionWrites = contract.stateWrites.filter(
		(write) =>
			write.kind === 'write' &&
			write.confidence === 'exact' &&
			(write.operation === 'map' || write.operation === 'set')
	);
	const writePathSet = new Set(writePaths);
	const deletionPaths = writePaths.includes('*') ? [] : writePaths;
	const handler: ExactGeneratedContinuationHandler = async (input, context) => {
		const dependencies = continuationDependencies(input.payload, contract.dependencies.length);
		if (!dependencies)
			throw new TypeError(`Malformed activation record for eXact continuation ${contract.id}`);
		warnUnavailableTaskProgress(contract, context);
		const state = activationState(input.state);
		const arrays = new Map<string, { source: unknown[]; before: ArrayBefore }>();
		if (executor.array)
			for (const write of contract.stateWrites) {
				if (!write.arrayRoots?.some((root) => root.path.join('.') === write.path)) continue;
				const found = readPath(state, write.path);
				if (found.present && Array.isArray(found.value))
					arrays.set(write.path, {
						source: unwrap(found.value),
						before: executor.array.capture(found.value)
					});
			}
		let collectionPaths: WeakMap<object, string[]> | undefined;
		for (const write of collectionWrites) {
			const found = readPath(state, write.path);
			if (!found.present) continue;
			const raw = unwrap(found.value);
			if (!(write.operation === 'map' ? raw instanceof Map : raw instanceof Set)) continue;
			const collection = raw as object;
			collectionPaths ??= new WeakMap();
			const paths = collectionPaths.get(collection);
			if (!paths) collectionPaths.set(collection, [write.path]);
			else if (!paths.includes(write.path)) paths.push(write.path);
		}
		// Cleanup reads are limited to the original activation's submitted receivers.
		const receivers = contract.stateReads.length ? new WeakSet<object>([state]) : undefined;
		if (receivers) {
			for (const read of contract.stateReads) {
				if (read.path !== '*') retainSubmittedReadReceivers(state, read.path, receivers);
			}
		}
		prepareContinuationWriteContainers(state, contract.stateWrites);
		// Inputs and prepared parent containers are not evidence that a conditional write ran.
		const inputWritePaths = new Set(
			writePaths.filter((path) => path !== '*' && readPath(state, path).present)
		);
		const generation = continuationGeneration(input.payload);
		const signal = context.signal ?? new AbortController().signal;
		let mutationSignal = signal;
		let result: Awaited<ReturnType<typeof executor.execute>>;
		try {
			signal.throwIfAborted();
			const execution = runTaskFrame(
				{
					kind: 'server-continuation',
					label: contract.id,
					generation,
					readiness: contract.readiness
				},
				{
					work: (task) => {
						mutationSignal = task.signal;
						if (receivers || contract.stateWrites.length)
							captureTaskPropertyMutations(task.signal, {
								requestInvocations: true,
								requestReads: receivers && { root: state, receivers },
								collectionPaths
							});
						if (context.reportTaskProgress)
							attachTaskProgressReporter(task, (receiver, snapshot) => {
								if (!contract.progress?.some((entry) => entry.id === receiver))
									throw new TypeError('Undeclared task progress receiver');
								context.reportTaskProgress!(receiver, snapshot);
							});
						return executor.execute(
							{
								state,
								dependencies,
								publicContext: input.publicContext ?? {},
								...(generation === undefined ? {} : { generation })
							},
							{
								task,
								signal: task.signal,
								getContext: (token, authoredName) => {
									if (!context.contexts)
										throw new Error(
											`No server context scope is active for eXact continuation ${contract.id}`
										);
									context.onContextAccess?.({
										operationId: contract.id,
										componentId: contract.componentId,
										token: authoredName ?? token.description,
										scope: token.scope
									});
									return context.contexts.getSync(token);
								},
								setContext: (token, value, authoredName) => {
									const name = authoredName ?? token.description;
									if (!(contract.serverContextWrites ?? []).includes(name)) {
										throw new TypeError(
											`Continuation ${contract.id} wrote undeclared server context ${name}`
										);
									}
									if (!context.contexts?.setSync) {
										throw new Error(
											`No mutable server context scope is active for eXact continuation ${contract.id}`
										);
									}
									context.onContextAccess?.({
										operationId: contract.id,
										componentId: contract.componentId,
										token: name,
										scope: token.scope
									});
									context.contexts.setSync(token, value);
								}
							}
						);
					}
				}
			);
			// The operation lifetime includes request disconnect and response-reader cancellation.
			// A frame's controller is independent, so explicitly connect and release this edge.
			const cancel = () => execution.cancel(signal.reason);
			signal.addEventListener('abort', cancel, { once: true });
			if (signal.aborted) cancel();
			try {
				result = await execution;
			} finally {
				signal.removeEventListener('abort', cancel);
			}
			// Publish the writes staged by the existing blocking transaction. Native effects
			// already performed in request-local storage remain in the finite successful after-image.
			publishTaskMutations(mutationSignal);
		} catch (error) {
			discardTaskMutations(mutationSignal);
			throw error;
		}
		const propertyMutations = takeTaskPropertyMutations(mutationSignal);
		const checkedValues = new Map<string, unknown>();
		const arrayMutations: ExactCollectionMutation[] = [];
		const compared = new Set<string>();
		const scalarArraySets = new Set<string>(),
			scalarArrayDeletes: string[] = [];
		for (const [path, baseline] of arrays) {
			const lineage: { receiver: object; key: string }[] = [];
			const found = readPath(result.state, path, lineage);
			if (found.present) checkedValues.set(path, found.value);
			if (
				found.present &&
				Array.isArray(found.value) &&
				unwrap(found.value) === baseline.source &&
				!lineage.some((edge) => propertyMutations?.(edge.receiver, edge.key) === 'set')
			) {
				const final = executor.array!.capture(found.value);
				arrayMutations.push(
					...executor.array!.diff(
						baseline.before,
						final,
						path,
						arrayScalarWrites(baseline.before, final, propertyMutations)
					)
				);
				const scalar = arrayScalarOutputPaths(path, found.value, propertyMutations);
				for (const selected of scalar.sets) scalarArraySets.add(selected);
				scalarArrayDeletes.push(...scalar.deletions);
				compared.add(path);
			}
		}
		const statePaths = [...writePaths, ...scalarArraySets].filter((path) => {
			if (
				!scalarArraySets.has(path) &&
				[...compared].some((root) => path === root || path.startsWith(root + '.'))
			)
				return false;
			const found = checkedValues.has(path)
				? { present: true, value: checkedValues.get(path) }
				: readPath(result.state, path);
			if (!found.present) return false;
			checkedValues.set(path, found.value);
			return (
				!inputWritePaths.has(path) ||
				recordedPropertyMutation(result.state, path, propertyMutations) === 'set'
			);
		});
		const projected = projectContinuationState(result.state, statePaths, checkedValues);
		const selected = new Set(statePaths);
		// A final subtree snapshot already includes every mutation within it, including
		// operations later superseded by replacement. Replaying them would restore old data.
		const covered = new Set([...selected, ...compared]);
		const mutations = [
			...arrayMutations,
			...(takeTaskCollectionMutations(mutationSignal)?.filter(
				(mutation) => !stateSnapshotCoversPath(mutation.path, covered)
			) ?? [])
		];
		const contexts = projectContinuationContexts(result.contexts, contract.contextWrites);
		const deletions = propertyMutations
			? [
					...new Set([
						...projectDeletedStatePaths(result.state, deletionPaths, propertyMutations).filter(
							(path) => !stateSnapshotCoversPath(path, compared)
						),
						...scalarArrayDeletes
					])
				]
			: [];
		return {
			...(projected === undefined ? {} : { state: projected }),
			...(requiresStateSelection(selected, writePathSet) ? { statePaths } : {}),
			...(mutations?.length ? { mutations } : {}),
			...(deletions.length ? { deletions } : {}),
			...(contexts === undefined ? {} : { contexts }),
			...('value' in result ? { value: result.value } : {})
		};
	};
	generatedHandlers.set(contract, { executor, handler });
	return handler;
}

function continuationGeneration(payload: unknown): number | undefined {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
	const generation = (payload as Record<string, unknown>).generation;
	if (generation === undefined) return undefined;
	if (!Number.isSafeInteger(generation) || (generation as number) < 1)
		throw new TypeError('Malformed continuation invocation generation');
	return generation as number;
}

/** Emits selections only when the partial tree would otherwise imply a skipped parent replacement. */
function requiresStateSelection(
	selected: ReadonlySet<string>,
	allowed: ReadonlySet<string>
): boolean {
	for (const path of selected) if (hasStatePathAncestor(path, allowed, selected)) return true;
	return false;
}

/** Reports whether a final selected subtree subsumes a collection delta at this path. */
function stateSnapshotCoversPath(path: string, selected: ReadonlySet<string>): boolean {
	return selected.has('*') || selected.has(path) || hasStatePathAncestor(path, selected);
}

/** Checks finite path prefixes with set membership, optionally excluding already selected parents. */
function hasStatePathAncestor(
	path: string,
	candidates: ReadonlySet<string>,
	excluded?: ReadonlySet<string>
): boolean {
	for (
		let separator = path.indexOf('.');
		separator >= 0;
		separator = path.indexOf('.', separator + 1)
	) {
		const parent = path.slice(0, separator);
		if (candidates.has(parent) && !excluded?.has(parent)) return true;
	}
	return false;
}

/** Reads execution evidence only from the final receiver selected by an authorized path. */
function recordedPropertyMutation(
	state: Record<string, unknown>,
	path: string,
	mutations: ((receiver: object, key: PropertyKey) => 'set' | 'delete' | undefined) | undefined
): 'set' | 'delete' | undefined {
	if (!mutations) return undefined;
	const separator = path.lastIndexOf('.');
	const parent =
		separator < 0
			? { present: true as const, value: state }
			: readPath(state, path.slice(0, separator));
	if (!parent.present || !parent.value || typeof parent.value !== 'object') return undefined;
	return mutations(parent.value, path.slice(separator + 1));
}

/** Projects performed deletes only when their final receiver remains at an authorized path. */
function projectDeletedStatePaths(
	state: Record<string, unknown>,
	paths: readonly string[],
	mutations: (receiver: object, key: PropertyKey) => 'set' | 'delete' | undefined
): string[] {
	return paths.filter(
		(path) =>
			!readPath(state, path).present &&
			recordedPropertyMutation(state, path, mutations) === 'delete'
	);
}

/** Selects only compiler-authorized public component-context writes. */
function projectContinuationContexts(
	contexts: Readonly<Record<string, unknown>> | undefined,
	allowed: readonly string[]
): Record<string, unknown> | undefined {
	if (!contexts) return undefined;
	const allowedNames = new Set(allowed);
	const output: Record<string, unknown> = {};
	for (const name of Object.keys(contexts)) {
		if (!allowedNames.has(name))
			throw new TypeError(`Continuation returned undeclared component context ${name}`);
		output[name] = contexts[name];
	}
	return Object.keys(output).length ? output : undefined;
}

/** Validates the generated payload envelope and exact dependency arity. */
export function continuationDependencies(
	payload: unknown,
	expected: number
): readonly unknown[] | undefined {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
	const keys = Object.keys(payload);
	if (
		!keys.includes('dependencies') ||
		keys.some((key) => key !== 'dependencies' && key !== 'generation')
	)
		return undefined;
	const dependencies = (payload as Record<string, unknown>).dependencies;
	return Array.isArray(dependencies) && dependencies.length === expected ? dependencies : undefined;
}

/** Converts an absent zero-read snapshot into an empty request-local state object. */
function activationState(value: unknown): Record<string, unknown> {
	if (value === undefined) return {};
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new TypeError('Malformed eXact continuation state activation');
	return value as Record<string, unknown>;
}

/** Selects only exact compiler-authorized writes from the mutated activation state. */
function projectContinuationState(
	state: Record<string, unknown>,
	paths: readonly string[],
	selectedArrayValues?: ReadonlyMap<string, unknown>
): unknown {
	if (!paths.length) return undefined;
	if (paths.includes('*')) return state;
	const output: Record<string, unknown> = {};
	for (const path of paths) {
		const found = selectedArrayValues?.has(path)
			? { present: true, value: selectedArrayValues.get(path) }
			: readPath(state, path);
		if (found.present) writePath(output, path, found.value);
	}
	return Object.keys(output).length ? output : undefined;
}

/** Reads an own-property path without treating an explicit undefined as absence. */
function readPath(
	value: unknown,
	path: string,
	lineage?: { receiver: object; key: string }[]
): { present: true; value: unknown } | { present: false } {
	if (path === '*') return { present: true, value };
	let cursor = value;
	for (const segment of path.split('.')) {
		if (!safeSegment(segment) || !cursor || typeof cursor !== 'object') return { present: false };
		if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return { present: false };
		lineage?.push({ receiver: cursor, key: segment });
		cursor = (cursor as Record<string, unknown>)[segment];
	}
	return { present: true, value: cursor };
}

/** Retains only submitted own-data receivers along the declared read, without invoking accessors. */
function retainSubmittedReadReceivers(
	state: object,
	path: string,
	receivers: WeakSet<object>
): void {
	let current = state;
	for (const key of path.split('.')) {
		if (!safeSegment(key)) return;
		const descriptor = Reflect.getOwnPropertyDescriptor(current, key);
		if (
			!descriptor ||
			!('value' in descriptor) ||
			!descriptor.value ||
			typeof descriptor.value !== 'object'
		)
			return;
		current = descriptor.value;
		receivers.add(current);
	}
}

/** Materializes a validated dotted path into a partial response tree. */
function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
	const segments = path.split('.');
	if (!segments.length || !segments.every(safeSegment)) return;
	let cursor = target;
	for (const segment of segments.slice(0, -1)) {
		const next = cursor[segment];
		if (next && typeof next === 'object' && !Array.isArray(next)) {
			cursor = next as Record<string, unknown>;
		} else {
			const created: Record<string, unknown> = {};
			cursor[segment] = created;
			cursor = created;
		}
	}
	cursor[segments.at(-1)!] = value;
}

/** Rejects prototype-bearing path segments before projection. */
function safeSegment(segment: string): boolean {
	return (
		segment.length > 0 &&
		segment !== '__proto__' &&
		segment !== 'prototype' &&
		segment !== 'constructor'
	);
}
