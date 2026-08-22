import { peek, scheduleWork, type ReactiveValue } from '@exactjs/reactive/framework/runtime';

import { readExactInspectionSource } from '../component/inspection-source.js';
import type { TaskActivation, TaskContext, TaskFunction, TaskInvocation } from './contracts.js';
import {
	attachTaskFrameSettlement,
	currentTaskFrameRecord,
	executeTaskFrame,
	materializeDeferredTaskFrame,
	registerTaskOwnerCleanup,
	type TaskActivationRegistration,
	type TaskOwnerRecord
} from './frame-runtime.js';
import { TaskInvocationValue } from './invocation.js';
import { taskOwnerForHost } from './owner-hosts.js';
import { activationInputDependency } from './dependency-source.js';
import {
	watchContinuationDependencies,
	type ContinuationDependencyWatcher
} from './dependency-watcher.js';
import {
	componentExecutionDependencies,
	componentExecutionOutputs
} from './component-execution-capability.js';
import { componentExecutionSliceAllows } from './component-execution-slice.js';
import {
	markCompiledTaskPerformanceTrace,
	startCompiledTaskPerformanceTrace
} from './performance-trace.js';

type ActivationInput<T> = T | ReactiveValue<T>;

type LatestTaskState<Args extends unknown[], Result> = {
	readonly owner: TaskOwnerRecord;
	readonly label: string;
	readonly implementation: (...args: [...Args, TaskContext]) => Result | Promise<Result>;
	readonly sourceEntityId?: string;
	generation: number;
	active?: AbortController;
};

/**
 * Binds the compact runtime lane selected for a compiler-proven, call-only
 * `TaskContext.client().latest()` task with the default scheduling policy.
 */
export function bindCompiledClientLatestTaskForHost<Args extends unknown[], Result>(
	host: object,
	label: string,
	implementation: (...args: [...Args, TaskContext]) => Result | Promise<Result>
): TaskFunction<Args, Awaited<Result>> {
	const state = createLatestTaskState(host, label, implementation);
	return ((...args: Args) => invokeLatestTask(state, args, 'invoked')) as TaskFunction<
		Args,
		Awaited<Result>
	>;
}

/**
 * Activates the compact default client/latest lane for compiler-owned setup work.
 * Dependency observation and SSR deferral remain identical to the universal activation ABI.
 */
export function activateCompiledClientLatestTaskForHost<Args extends unknown[], Result>(
	host: object,
	label: string,
	implementation: (...args: [...Args, TaskContext]) => Result | Promise<Result>,
	...inputs: { [Index in keyof Args]: ActivationInput<Args[Index]> }
): Disposable {
	const state = createLatestTaskState(host, label, implementation);
	const taskIdentity = implementation as unknown as TaskFunction<Args, Result>;
	if (!componentExecutionSliceAllows(state.owner, taskIdentity)) return inertActivation;
	let dependencies = inputs.map(activationInputDependency) as {
		[Index in keyof Args]: ReturnType<typeof activationInputDependency<Args[Index]>>;
	};
	dependencies = componentExecutionDependencies(state.owner, taskIdentity, dependencies);
	let watcher: ContinuationDependencyWatcher | undefined;
	let releaseDependencyWait: (() => void) | undefined;
	const registration: TaskActivationRegistration = {
		task: taskIdentity,
		settled: false,
		start(skipInitial) {
			if (watcher) return;
			let initial = true;
			const settleDependencyWait = () => {
				releaseDependencyWait?.();
				releaseDependencyWait = undefined;
			};
			watcher = watchContinuationDependencies(dependencies, {
				onReady(vector) {
					settleDependencyWait();
					if (skipInitial && initial) {
						initial = false;
						registration.settled = true;
						return;
					}
					const activation = initial ? 'initialization' : 'reactive';
					initial = false;
					registration.settled = false;
					const outputs = componentExecutionOutputs(state.owner, taskIdentity);
					const invocation = peek(() => invokeLatestTask(state, vector.values as Args, activation));
					void Promise.resolve(invocation).then(
						() => {
							outputs?.publish();
							registration.settled = true;
						},
						(error) => {
							outputs?.settleFailure(error);
							registration.settled = false;
						}
					);
				},
				onUnavailable(unavailable) {
					registration.settled = false;
					state.active?.abort('task-activation-dependency-unavailable');
					if (unavailable !== 'pending' || releaseDependencyWait || !state.owner.observeSettlement)
						return;
					let release!: () => void;
					const settlement = new Promise<void>((resolve) => (release = resolve));
					releaseDependencyWait = release;
					state.owner.observeSettlement(settlement);
				}
			});
			watcher.evaluate();
		}
	};
	state.owner.activationRegistrations.add(registration);
	if (!state.owner.activationsDeferred) registration.start(false);
	let disposed = false;
	const activation: Disposable = {
		[Symbol.dispose]() {
			if (disposed) return;
			disposed = true;
			watcher?.[Symbol.dispose]();
			releaseDependencyWait?.();
			releaseDependencyWait = undefined;
			state.active?.abort('task-activation-disposed');
			state.owner.activationRegistrations.delete(registration);
			state.owner.ownerCleanups.delete(cleanup);
		}
	};
	const cleanup = activation[Symbol.dispose].bind(activation);
	registerTaskOwnerCleanup(state.owner, cleanup);
	return activation;
}

function createLatestTaskState<Args extends unknown[], Result>(
	host: object,
	label: string,
	implementation: (...args: [...Args, TaskContext]) => Result | Promise<Result>
): LatestTaskState<Args, Awaited<Result>> {
	const owner = taskOwnerForHost(host);
	if (!owner)
		throw new Error('A compiled client/latest task requires a registered durable task host');
	const sourceEntityId = readExactInspectionSource(implementation);
	return {
		owner,
		label,
		implementation: implementation as LatestTaskState<Args, Awaited<Result>>['implementation'],
		...(sourceEntityId ? { sourceEntityId } : {}),
		generation: 0
	};
}

function invokeLatestTask<Args extends unknown[], Result>(
	state: LatestTaskState<Args, Result>,
	args: Args,
	activation: TaskActivation
): TaskInvocation<Result> {
	state.active?.abort('superseded');
	const controller = new AbortController();
	state.active = controller;
	const generation = ++state.generation;
	const parent =
		activation === 'invoked'
			? (currentTaskFrameRecord() ?? materializeDeferredTaskFrame())
			: undefined;
	let releaseReservation: (() => void) | undefined;
	if (parent) {
		const reservation = new Promise<void>((resolve) => (releaseReservation = resolve));
		attachTaskFrameSettlement(parent, reservation);
	}
	let resolve!: (value: Result) => void;
	let reject!: (error: unknown) => void;
	const settlement = new Promise<Result>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	void settlement.catch(() => undefined);
	let observed = false;
	state.owner.settlements.add(settlement);
	state.owner.observeSettlement?.(settlement);
	void settlement
		.finally(() => {
			state.owner.settlements.delete(settlement);
			if (state.active === controller) state.active = undefined;
		})
		.catch(() => undefined);
	scheduleWork(
		() => {
			const trace = startCompiledTaskPerformanceTrace(
				state.owner,
				{ activation, generation, priority: 'normal' },
				state.sourceEntityId,
				state.label
			);
			const execute = () =>
				executeTaskFrame(
					{
						parent,
						parentReserved: releaseReservation !== undefined,
						owner: state.owner,
						controller,
						generation,
						activation,
						label: state.label,
						sourceEntityId: state.sourceEntityId,
						placement: 'client',
						concurrency: 'latest',
						priority: 'normal',
						readiness: 'nonblocking',
						inspectionArguments: args,
						detached: activation !== 'invoked',
						propagateFailure: () => !observed
					},
					(context) => state.implementation(...args, context)
				);
			let execution: Promise<Result>;
			try {
				execution = state.owner.runTask && !parent ? state.owner.runTask(execute) : execute();
			} catch (error) {
				releaseReservation?.();
				markCompiledTaskPerformanceTrace(trace, { outcome: 'error' });
				reject(error);
				return;
			}
			releaseReservation?.();
			void execution.then(
				(value) => {
					markCompiledTaskPerformanceTrace(trace, { outcome: 'success' });
					resolve(value);
				},
				(error) => {
					markCompiledTaskPerformanceTrace(trace, {
						outcome: controller.signal.aborted ? 'cancelled' : 'error'
					});
					reject(error);
				}
			);
		},
		'normal',
		(error) => {
			releaseReservation?.();
			reject(error);
		}
	);
	return new TaskInvocationValue(settlement, () => {
		observed = true;
	});
}

const inertActivation: Disposable = Object.freeze({ [Symbol.dispose]() {} });
