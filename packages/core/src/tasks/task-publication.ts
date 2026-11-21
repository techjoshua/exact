import { sharedTaskRuntimeState } from './runtime-state.js';
import { batch, mutateReactiveCollection, unwrap } from '@exactjs/reactive/framework/runtime';
import type { ExactCollectionMutation } from '../component-contracts.js';
import {
	discardTaskPropertyMutations,
	withTaskPropertyMutationCapture,
	taskPublicationCaptureOwner,
	taskCollectionMutationPaths
} from './property-mutations.js';
import {
	discardPendingTaskTransactions,
	releasePendingTaskTransactions
} from './pending-transactions.js';

const { taskMutations, taskCollectionMutations } = sharedTaskRuntimeState(
	'publication-journals',
	() => ({
		taskMutations: new WeakMap<AbortSignal, Array<() => void>>(),
		taskCollectionMutations: new WeakMap<AbortSignal, ExactCollectionMutation[]>()
	})
);

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
			for (const mutation of staged) withTaskPropertyMutationCapture(signal, mutation);
		});
		releasePendingTaskTransactions(signal);
	} catch (error) {
		discardPendingTaskTransactions(signal);
		throw error;
	}
}

/** Discards every unpublished mutation owned by a task generation. */
export function discardTaskMutations(signal: AbortSignal): void {
	discardTaskPropertyMutations(signal);
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
	const owner = taskPublicationCaptureOwner(signal);
	if (signal.aborted || owner.aborted) return undefined;
	const input = typeof args === 'function' ? args() : args;
	const collection = readTaskCollection(target, path);
	const raw = unwrap(collection);
	const changed = collectionMutationChanges(raw, kind, method, input);
	const result = mutateReactiveCollection(target, path, kind, method, input);
	if (changed) recordCollectionMutation(owner, path.map(String).join('.'), kind, method, input);
	return result;
}

/** Records only committed native operations against a request's submitted collection identities. */
export function pendingTaskCollectionObserver(signal: AbortSignal) {
	const allowed = taskCollectionMutationPaths(signal);
	if (!allowed) return;
	return (receiver: object, method: PropertyKey, args: readonly unknown[]) => {
		const raw = unwrap(receiver);
		const paths = allowed.get(raw);
		if (!paths || typeof method !== 'string') return;
		if (signal.aborted || taskCollectionMutationPaths(signal) !== allowed) return;
		const owner = taskPublicationCaptureOwner(signal);
		const kind = raw instanceof Map ? 'map' : 'set';
		if (collectionMutationChanges(raw, kind, method, args))
			for (const path of paths) recordCollectionMutation(owner, path, kind, method, args);
	};
}

/** Appends one observed change to the active owner's response in publication order. */
function recordCollectionMutation(
	owner: AbortSignal,
	path: string,
	kind: 'map' | 'set',
	method: string,
	input: readonly unknown[]
): void {
	let mutations = taskCollectionMutations.get(owner);
	if (!mutations) {
		mutations = [];
		taskCollectionMutations.set(owner, mutations);
		owner.addEventListener('abort', () => discardTaskMutations(owner), { once: true });
	}
	mutations.push(collectionMutation(path, kind, method, input));
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
	location: string,
	kind: 'map' | 'set',
	method: string,
	args: readonly unknown[]
): ExactCollectionMutation {
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
