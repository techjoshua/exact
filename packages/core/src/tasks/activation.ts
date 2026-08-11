import { peek, type ReactiveValue } from '@exactjs/reactive';

import type { TaskFunction } from './contracts.js';
import {
	currentTaskOwnerRecord,
	registerTaskOwnerCleanup,
	type TaskActivationRegistration,
	type TaskOwnerRecord
} from './frame-runtime.js';
import { taskOwnerForHost } from './owner-hosts.js';
import { bindTask, invokeTaskForActivation } from './runtime.js';
import {
	beginComponentContinuationOutputs,
	componentContinuationDependencies
} from './component-execution.js';
import {
	activationInputDependency,
	type ContinuationDependencySource
} from './dependency-source.js';
import {
	watchContinuationDependencies,
	type ContinuationDependencyWatcher
} from './dependency-watcher.js';

type ActivationInput<T> = T | ReactiveValue<T>;

/**
 * Activates a task during durable host setup and reruns it when one of its
 * compiler-supplied reactive argument values changes.
 */
export function activateTask<Args extends unknown[], Result>(
	task: TaskFunction<Args, Result>,
	...inputs: { [Index in keyof Args]: ActivationInput<Args[Index]> }
): Disposable {
	const owner = currentTaskOwnerRecord();
	if (!owner)
		throw new Error('activateTask() requires a durable task host during component initialization');
	return activateOwnedTask(owner, task, inputs);
}

/**
 * Activates compiler-generated setup work against an explicit durable host.
 *
 * The explicit host preserves ownership when development module graphs contain
 * more than one physical copy of the core runtime.
 */
export function activateTaskForHost<Args extends unknown[], Result>(
	host: object,
	task: TaskFunction<Args, Result>,
	...inputs: { [Index in keyof Args]: ActivationInput<Args[Index]> }
): Disposable {
	const owner = taskOwnerForHost(host);
	if (!owner) throw new Error('activateTaskForHost() requires a registered durable task host');
	return activateOwnedTask(owner, task, inputs);
}

/**
 * Activates compiler-generated continuation work from availability-aware dependency sources.
 *
 * This is a framework ABI: application code should use {@link activateTask}. The returned watcher
 * and all issued task generations are owned by the supplied durable host.
 */
export function activateTaskFromDependenciesForHost<Args extends unknown[], Result>(
	host: object,
	task: TaskFunction<Args, Result>,
	dependencies: { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> }
): Disposable {
	const owner = taskOwnerForHost(host);
	if (!owner)
		throw new Error(
			'activateTaskFromDependenciesForHost() requires a registered durable task host'
		);
	return activateOwnedTaskFromDependencies(owner, task, dependencies);
}

function activateOwnedTask<Args extends unknown[], Result>(
	owner: TaskOwnerRecord,
	task: TaskFunction<Args, Result>,
	inputs: { [Index in keyof Args]: ActivationInput<Args[Index]> }
): Disposable {
	const dependencies = inputs.map(activationInputDependency) as {
		[Index in keyof Args]: ContinuationDependencySource<Args[Index]>;
	};
	return activateOwnedTaskFromDependencies(owner, task, dependencies);
}

function activateOwnedTaskFromDependencies<Args extends unknown[], Result>(
	owner: TaskOwnerRecord,
	task: TaskFunction<Args, Result>,
	dependencies: { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> }
): Disposable {
	const bound = bindTask(task, { owner });
	dependencies = componentContinuationDependencies(owner, task, dependencies);
	let watcher: ContinuationDependencyWatcher | undefined;
	let releaseDependencyWait: (() => void) | undefined;
	const registration: TaskActivationRegistration = {
		task,
		settled: false,
		start(skipInitial) {
			if (watcher) return;
			let initial = true;
			const settleDependencyWait = () => {
				releaseDependencyWait?.();
				releaseDependencyWait = undefined;
			};
			const retainDependencyWait = () => {
				if (releaseDependencyWait || !owner.observeSettlement) return;
				let release!: () => void;
				const settlement = new Promise<void>((resolve) => (release = resolve));
				releaseDependencyWait = release;
				owner.observeSettlement(settlement);
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
					const args = vector.values as Args;
					registration.settled = false;
					const outputs = beginComponentContinuationOutputs(owner, task);
					const invocation = peek(() => invokeTaskForActivation(task, owner, activation, args));
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
				onUnavailable(state) {
					registration.settled = false;
					bound.cancel('task-activation-dependency-unavailable');
					if (state === 'pending') retainDependencyWait();
					else settleDependencyWait();
				}
			});
			watcher.evaluate();
		}
	};
	owner.activationRegistrations.add(registration);
	if (!owner.activationsDeferred) registration.start(false);
	let disposed = false;
	const activation: Disposable = {
		[Symbol.dispose]() {
			if (disposed) return;
			disposed = true;
			watcher?.[Symbol.dispose]();
			releaseDependencyWait?.();
			releaseDependencyWait = undefined;
			bound.cancel('task-activation-disposed');
			owner.activationRegistrations.delete(registration);
			owner.ownerCleanups.delete(cleanup);
		}
	};
	const cleanup = activation[Symbol.dispose].bind(activation);
	registerTaskOwnerCleanup(owner, cleanup);
	return activation;
}

/** Defers setup activations until a framework host has restored resumable state. */
export function deferTaskOwnerActivations(owner: TaskOwnerRecord): void {
	owner.activationsDeferred = true;
}

/**
 * Arms deferred setup activations after resumption, optionally suppressing the
 * first generation when SSR already settled the compiler-owned continuation.
 */
export function releaseTaskOwnerActivations(
	owner: TaskOwnerRecord,
	skipInitial: (task: TaskFunction<any[], unknown>) => boolean
): void {
	owner.activationsDeferred = false;
	for (const registration of owner.activationRegistrations) {
		registration.start(skipInitial(registration.task));
	}
}
