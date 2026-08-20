import type {
	ExactComponentContinuationContract,
	ExactComponentContinuationExecutorContract
} from '@exactjs/core/framework/component-contracts';
import {
	discardTaskMutations,
	publishTaskMutations,
	takeTaskCollectionMutations
} from '@exactjs/core';
import { runTaskFrame } from '@exactjs/core/framework/task-frames';
import type { ExactInvocationRequest, ExactInvocationResult, ExactServerContext } from './types.js';

/** Application-compatible handler generated from one compiler-owned continuation executor. */
export type ExactGeneratedContinuationHandler = (
	input: ExactInvocationRequest,
	context: ExactServerContext
) => Promise<ExactInvocationResult>;

const generatedHandlers = new WeakMap<
	ExactComponentContinuationExecutorContract,
	ExactGeneratedContinuationHandler
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
	const cached = generatedHandlers.get(executor);
	if (cached) return cached;
	const handler: ExactGeneratedContinuationHandler = async (input, context) => {
		const dependencies = continuationDependencies(input.payload, contract.dependencies.length);
		if (!dependencies)
			throw new TypeError(`Malformed activation record for eXact continuation ${contract.id}`);
		const state = activationState(input.state);
		const generation = continuationGeneration(input.payload);
		const signal = context.signal ?? new AbortController().signal;
		let mutationSignal = signal;
		let result: Awaited<ReturnType<typeof executor.execute>>;
		try {
			result = await runTaskFrame(
				{
					kind: 'server-continuation',
					label: contract.id,
					generation,
					readiness: contract.readiness
				},
				{
					work: (task) => {
						mutationSignal = task.signal;
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
									context.onContextAccess?.(
										Object.freeze({
											operationId: contract.id,
											componentId: contract.componentId,
											token: authoredName ?? token.description,
											scope: token.scope
										})
									);
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
									context.onContextAccess?.(
										Object.freeze({
											operationId: contract.id,
											componentId: contract.componentId,
											token: name,
											scope: token.scope
										})
									);
									context.contexts.setSync(token, value);
								}
							}
						);
					}
				}
			);
			// The request-local activation is an unpublished transaction. Compiler-staged
			// writes become visible only after the executor has completed successfully.
			publishTaskMutations(mutationSignal);
		} catch (error) {
			discardTaskMutations(mutationSignal);
			throw error;
		}
		const projected = projectContinuationState(result.state, contract.stateWrites);
		const mutations = takeTaskCollectionMutations(mutationSignal);
		const contexts = projectContinuationContexts(result.contexts, contract.contextWrites);
		return {
			...(projected === undefined ? {} : { state: projected }),
			...(mutations === undefined ? {} : { mutations: [...mutations] }),
			...(contexts === undefined ? {} : { contexts }),
			...('value' in result ? { value: result.value } : {})
		};
	};
	generatedHandlers.set(executor, handler);
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
	writes: ExactComponentContinuationContract['stateWrites']
): unknown {
	const paths = writes
		.filter(
			(write) =>
				write.kind === 'write' &&
				write.confidence === 'exact' &&
				write.operation !== 'map' &&
				write.operation !== 'set'
		)
		.map((write) => write.path);
	if (!paths.length) return undefined;
	if (paths.includes('*')) return state;
	const output: Record<string, unknown> = {};
	for (const path of paths) {
		const found = readPath(state, path);
		if (found.present) writePath(output, path, found.value);
	}
	return Object.keys(output).length ? output : undefined;
}

/** Reads an own-property path without treating an explicit undefined as absence. */
function readPath(
	value: unknown,
	path: string
): { present: true; value: unknown } | { present: false } {
	let cursor = value;
	for (const segment of path.split('.')) {
		if (!safeSegment(segment) || !cursor || typeof cursor !== 'object') return { present: false };
		if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return { present: false };
		cursor = (cursor as Record<string, unknown>)[segment];
	}
	return { present: true, value: cursor };
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
