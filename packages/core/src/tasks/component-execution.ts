import type { ExactComponentExecutionContract } from '../component-contracts.js';
import { isTaskCancellation } from './cancellation.js';
import { componentContinuationTaskId } from './component-continuation.js';
import type { TaskFunction } from './contracts.js';
import {
	createContinuationDependencySlot,
	type ContinuationDependencySlot,
	type ContinuationDependencySource
} from './dependency-source.js';
import type { TaskOwnerRecord } from './frame-contracts.js';
import { taskOwnerForHost } from './owner-hosts.js';
import { markContinuationDependencyValue } from './dependency-provenance.js';

type ComponentExecutionRuntime = Readonly<{
	host: { readonly state?: object };
	plan: ExactComponentExecutionContract;
	slots: ReadonlyMap<number, ContinuationDependencySlot<unknown>>;
	producers: ReadonlyMap<number, ReadonlySet<string>>;
	setupOutputs: ReadonlySet<number>;
}>;

/** Output generations reserved immediately before one continuation is issued. */
export type ComponentContinuationOutputs = Readonly<{
	publish(): void;
	settleFailure(error: unknown): void;
}>;

const runtimes = new WeakMap<TaskOwnerRecord, ComponentExecutionRuntime>();

/** Installs compiler-planned local slots before authored component setup begins. */
export function initializeComponentExecution(
	owner: TaskOwnerRecord,
	host: { readonly state?: object },
	plan: ExactComponentExecutionContract | undefined
): void {
	if (!plan) return;
	const slots = new Map<number, ContinuationDependencySlot<unknown>>();
	const producers = new Map<number, Set<string>>();
	const setupOutputs = new Set<number>();
	for (const transition of plan.transitions) {
		for (const output of transition.outputs) {
			slots.set(output, slots.get(output) ?? createContinuationDependencySlot());
			if (transition.activation === 'setup') setupOutputs.add(output);
			let ids = producers.get(output);
			if (!ids) producers.set(output, (ids = new Set()));
			ids.add(transition.id);
		}
	}
	runtimes.set(owner, { host, plan, slots, producers, setupOutputs });
}

/** Propagates a state output's pending/available source through an unchanged reactive value. */
export function componentExecutionValueForHost<T>(host: object, path: string, value: T): T {
	const owner = taskOwnerForHost(host);
	const runtime = owner ? runtimes.get(owner) : undefined;
	if (!runtime) return value;
	path = path.replace(/^this\.state\./, '');
	const port = runtime.plan.ports.find(
		(candidate) => candidate.kind === 'state' && candidate.path === path
	);
	const source = port ? runtime.slots.get(port.index) : undefined;
	if (!source || (!runtime.setupOutputs.has(port!.index) && source.read().generation === 0))
		return value;
	return markContinuationDependencyValue(value, source);
}

/** Replaces authored inputs with predecessor slots when another local transition owns the port. */
export function componentContinuationDependencies<Args extends unknown[]>(
	owner: TaskOwnerRecord,
	task: TaskFunction<Args, unknown>,
	authored: { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> }
): { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> } {
	const runtime = runtimes.get(owner);
	const transition = componentTransition(runtime, task);
	if (!runtime || !transition) return authored;
	return authored.map((source, index) => {
		const port = transition.inputs[index];
		if (port === undefined) return source;
		const producers = runtime.producers.get(port);
		if (!producers || (producers.size === 1 && producers.has(transition.id))) return source;
		return runtime.slots.get(port) ?? source;
	}) as { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> };
}

/** Reserves and later publishes every state output owned by one issued continuation generation. */
export function beginComponentContinuationOutputs<Args extends unknown[]>(
	owner: TaskOwnerRecord,
	task: TaskFunction<Args, unknown>
): ComponentContinuationOutputs | undefined {
	const runtime = runtimes.get(owner);
	const transition = componentTransition(runtime, task);
	if (!runtime || !transition) return undefined;
	const publications = transition.outputs.flatMap((portIndex) => {
		const port = runtime.plan.ports[portIndex];
		const slot = runtime.slots.get(portIndex);
		if (!port || !slot || port.kind !== 'state') return [];
		return [{ slot, generation: slot.beginGeneration(), path: port.path }];
	});
	if (!publications.length) return undefined;
	return {
		publish() {
			for (const publication of publications) {
				publication.slot.publish(
					publication.generation,
					readStatePath(runtime.host.state, publication.path)
				);
			}
		},
		settleFailure(error) {
			for (const publication of publications) {
				if (isTaskCancellation(error)) publication.slot.cancel(publication.generation, error);
				else publication.slot.fail(publication.generation, error);
			}
		}
	};
}

function componentTransition<Args extends unknown[]>(
	runtime: ComponentExecutionRuntime | undefined,
	task: TaskFunction<Args, unknown>
): ExactComponentExecutionContract['transitions'][number] | undefined {
	const id = componentContinuationTaskId(task);
	return id ? runtime?.plan.transitions.find((transition) => transition.id === id) : undefined;
}

function readStatePath(state: object | undefined, path: string): unknown {
	let value: unknown = state;
	for (const segment of path.split('.')) {
		if (!value || typeof value !== 'object') return undefined;
		value = (value as Record<string, unknown>)[segment];
	}
	return value;
}
