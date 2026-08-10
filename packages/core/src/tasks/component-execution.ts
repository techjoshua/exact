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
import {
	continuationDependencyForValue,
	markContinuationDependencyValue
} from './dependency-provenance.js';
import {
	prepareComponentExecution,
	type PreparedComponentExecution,
	type PreparedComponentTransition
} from './component-execution-plan.js';

type ComponentExecutionRuntime = Readonly<{
	host: { readonly state?: object };
	prepared: PreparedComponentExecution;
	sources: readonly (ContinuationDependencySource<unknown> | undefined)[];
}>;

/** Output generations reserved immediately before one continuation is issued. */
export type ComponentContinuationOutputs = Readonly<{
	publish(): void;
	settleFailure(error: unknown): void;
}>;

const runtimes = new WeakMap<TaskOwnerRecord, ComponentExecutionRuntime>();

/** Installs compiler-planned local slots and hidden prop sources before component setup begins. */
export function initializeComponentExecution(
	owner: TaskOwnerRecord,
	host: { readonly state?: object },
	plan: ExactComponentExecutionContract | undefined,
	props: Record<string, unknown>
): void {
	if (!plan?.transitions.length) return;
	const prepared = prepareComponentExecution(plan);
	const sources = new Array<ContinuationDependencySource<unknown> | undefined>(plan.ports.length);
	for (const output of prepared.outputPortIndexes)
		sources[output] = createContinuationDependencySlot();
	for (const port of prepared.propPorts) {
		if (sources[port.portIndex]) continue;
		const path = port.path;
		const source = continuationDependencyForValue(props[path[0]!]);
		if (source)
			sources[port.portIndex] = path.length === 1 ? source : projectDependency(source, path);
	}
	runtimes.set(owner, { host, prepared, sources });
}

/** Propagates a state output's pending/available source through an unchanged reactive value. */
export function componentExecutionValueForHost<T>(host: object, path: string, value: T): T {
	const owner = taskOwnerForHost(host);
	const runtime = owner ? runtimes.get(owner) : undefined;
	if (!runtime) return value;
	if (path.startsWith('this.state.')) path = path.slice(11);
	const portIndex = runtime.prepared.statePortsByPath.get(path);
	const source = portIndex === undefined ? undefined : runtime.sources[portIndex];
	if (!source || (!runtime.prepared.setupOutputs[portIndex!] && source.read().generation === 0))
		return value;
	return markContinuationDependencyValue(value, source);
}

/** Replaces authored inputs with planned predecessor or prop sources when the plan owns the port. */
export function componentContinuationDependencies<Args extends unknown[]>(
	owner: TaskOwnerRecord,
	task: TaskFunction<Args, unknown>,
	authored: { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> }
): { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> } {
	const runtime = runtimes.get(owner);
	const transition = componentTransition(runtime, task);
	if (!runtime || !transition) return authored;
	let resolved = authored;
	for (let index = 0; index < transition.dependencyPorts.length; index++) {
		const port = transition.dependencyPorts[index]!;
		if (port < 0 || !runtime.sources[port]) continue;
		if (resolved === authored) resolved = authored.slice() as typeof authored;
		(resolved as ContinuationDependencySource<unknown>[])[index] = runtime.sources[port]!;
	}
	return resolved;
}

/** Reserves and later publishes every state output owned by one issued continuation generation. */
export function beginComponentContinuationOutputs<Args extends unknown[]>(
	owner: TaskOwnerRecord,
	task: TaskFunction<Args, unknown>
): ComponentContinuationOutputs | undefined {
	const runtime = runtimes.get(owner);
	const transition = componentTransition(runtime, task);
	return runtime && transition?.outputs.length
		? new ComponentContinuationOutputBatch(runtime, transition)
		: undefined;
}

function componentTransition<Args extends unknown[]>(
	runtime: ComponentExecutionRuntime | undefined,
	task: TaskFunction<Args, unknown>
): PreparedComponentTransition | undefined {
	const id = componentContinuationTaskId(task);
	return id ? runtime?.prepared.transitionsById.get(id) : undefined;
}

class ComponentContinuationOutputBatch implements ComponentContinuationOutputs {
	readonly #generations: number | number[];

	constructor(
		private readonly runtime: ComponentExecutionRuntime,
		private readonly transition: PreparedComponentTransition
	) {
		if (transition.outputs.length === 1)
			this.#generations = outputSlot(runtime, transition.outputs[0]!.portIndex).beginGeneration();
		else {
			const generations = new Array<number>(transition.outputs.length);
			for (let index = 0; index < transition.outputs.length; index++)
				generations[index] = outputSlot(
					runtime,
					transition.outputs[index]!.portIndex
				).beginGeneration();
			this.#generations = generations;
		}
	}

	publish(): void {
		for (let index = 0; index < this.transition.outputs.length; index++) {
			const output = this.transition.outputs[index]!;
			outputSlot(this.runtime, output.portIndex).publish(
				this.#generation(index),
				readStatePath(this.runtime.host.state, output.path)
			);
		}
	}

	settleFailure(error: unknown): void {
		for (let index = 0; index < this.transition.outputs.length; index++) {
			const output = this.transition.outputs[index]!;
			const slot = outputSlot(this.runtime, output.portIndex);
			const generation = this.#generation(index);
			if (isTaskCancellation(error)) slot.cancel(generation, error);
			else slot.fail(generation, error);
		}
	}

	#generation(index: number): number {
		return typeof this.#generations === 'number' ? this.#generations : this.#generations[index]!;
	}
}

function outputSlot(
	runtime: ComponentExecutionRuntime,
	portIndex: number
): ContinuationDependencySlot<unknown> {
	return runtime.sources[portIndex] as ContinuationDependencySlot<unknown>;
}

function projectDependency(
	source: ContinuationDependencySource<unknown>,
	path: readonly string[]
): ContinuationDependencySource<unknown> {
	let prior: ReturnType<typeof source.read> | undefined;
	let projected: ReturnType<typeof source.read> | undefined;
	return {
		read() {
			const snapshot = source.read();
			if (snapshot === prior && projected) return projected;
			prior = snapshot;
			projected =
				snapshot.status === 'available'
					? { ...snapshot, value: readPath(snapshot.value, path, 1) }
					: snapshot;
			return projected;
		},
		subscribe: (notify) => source.subscribe(notify)
	};
}

function readStatePath(state: object | undefined, path: readonly string[]): unknown {
	return readPath(state, path);
}

function readPath(source: unknown, path: readonly string[], start = 0): unknown {
	let value = source;
	for (let index = start; index < path.length; index++) {
		const segment = path[index]!;
		if (!value || typeof value !== 'object') return undefined;
		value = (value as Record<string, unknown>)[segment];
	}
	return value;
}
