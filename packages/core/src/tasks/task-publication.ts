import { batch, mutateReactiveCollection, unwrap } from '@exactjs/reactive/framework/runtime';
import type { ExactCollectionMutation } from '../component-contracts.js';
import {
	discardPendingTaskTransactions,
	releasePendingTaskTransactions
} from './pending-transactions.js';

const taskMutations = new WeakMap<AbortSignal, Array<() => void>>();
const taskCollectionMutations = new WeakMap<AbortSignal, ExactCollectionMutation[]>();

/** Stages a compiler-generated mutation until its blocking task generation commits. */
export function stageTaskMutation(signal: AbortSignal, mutation: () => void): void {
	if (signal.aborted) return;
	let staged = taskMutations.get(signal);
	if (!staged) {
		staged = [];
		taskMutations.set(signal, staged);
		signal.addEventListener('abort', () => discardTaskMutations(signal), { once: true });
	}
	staged.push(mutation);
}

/** Publishes staged mutations for a successful task generation as one reactive batch. */
export function publishTaskMutations(signal: AbortSignal): void {
	const staged = taskMutations.get(signal);
	if (!staged) return;
	taskMutations.delete(signal);
	try {
		batch(() => {
			for (const mutation of staged) mutation();
		});
		releasePendingTaskTransactions(signal);
	} catch (error) {
		discardPendingTaskTransactions(signal);
		throw error;
	}
}

/** Discards every unpublished mutation owned by a task generation. */
export function discardTaskMutations(signal: AbortSignal): void {
	discardPendingTaskTransactions(signal);
	taskMutations.delete(signal);
	taskCollectionMutations.delete(signal);
}

/**
 * Applies a server-task collection mutation and records the smallest ordered
 * response delta that can reproduce the successful change in the browser.
 */
export function mutateTaskCollection(
	signal: AbortSignal,
	target: object,
	path: readonly PropertyKey[],
	kind: 'map' | 'set',
	method: 'set' | 'add' | 'delete' | 'clear',
	args: unknown[] | (() => unknown[])
): unknown {
	if (signal.aborted) return undefined;
	const input = typeof args === 'function' ? args() : args;
	const collection = readTaskCollection(target, path);
	const raw = unwrap(collection);
	const changed = collectionMutationChanges(raw, kind, method, input);
	const result = mutateReactiveCollection(target, path, kind, method, input);
	if (changed) {
		let mutations = taskCollectionMutations.get(signal);
		if (!mutations) {
			mutations = [];
			taskCollectionMutations.set(signal, mutations);
			signal.addEventListener('abort', () => discardTaskMutations(signal), { once: true });
		}
		mutations.push(collectionMutation(path, kind, method, input));
	}
	return result;
}

/** Takes the ordered collection deltas produced by one successful task generation. */
export function takeTaskCollectionMutations(
	signal: AbortSignal
): readonly ExactCollectionMutation[] | undefined {
	const mutations = taskCollectionMutations.get(signal);
	taskCollectionMutations.delete(signal);
	return mutations?.length ? mutations : undefined;
}

function readTaskCollection(target: object, path: readonly PropertyKey[]): unknown {
	let value: unknown = target;
	for (const segment of path) value = Reflect.get(value as object, segment);
	return value;
}

function collectionMutationChanges(
	value: unknown,
	kind: 'map' | 'set',
	method: string,
	args: readonly unknown[]
): boolean {
	if (kind === 'map' && value instanceof Map) {
		if (method === 'clear') return value.size > 0;
		if (method === 'delete') return value.has(unwrap(args[0]));
		const key = unwrap(args[0]);
		return !value.has(key) || !Object.is(value.get(key), unwrap(args[1]));
	}
	if (kind === 'set' && value instanceof Set) {
		if (method === 'clear') return value.size > 0;
		if (method === 'delete') return value.has(unwrap(args[0]));
		return !value.has(unwrap(args[0]));
	}
	return true;
}

function collectionMutation(
	path: readonly PropertyKey[],
	kind: 'map' | 'set',
	method: string,
	args: readonly unknown[]
): ExactCollectionMutation {
	const location = path.map(String).join('.');
	if (kind === 'map') {
		if (method === 'set')
			return { path: location, operation: 'map-set', key: unwrap(args[0]), value: unwrap(args[1]) };
		if (method === 'delete')
			return { path: location, operation: 'map-delete', key: unwrap(args[0]) };
		return { path: location, operation: 'map-clear' };
	}
	if (method === 'add') return { path: location, operation: 'set-add', value: unwrap(args[0]) };
	if (method === 'delete')
		return { path: location, operation: 'set-delete', value: unwrap(args[0]) };
	return { path: location, operation: 'set-clear' };
}
