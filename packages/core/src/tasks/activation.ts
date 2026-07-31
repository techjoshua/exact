import {
	isReactiveValue,
	peek,
	ref as reactiveRef,
	subscribe,
	unwrap,
	type ReactiveRef,
	type ReactiveValue
} from '@exactjs/reactive';

import type { TaskFunction } from './contracts.js';
import {
	currentTaskOwnerRecord,
	registerTaskOwnerCleanup,
	type TaskActivationRegistration,
	type TaskOwnerRecord
} from './frame-runtime.js';
import { taskOwnerForHost } from './owner-hosts.js';
import { bindTask, invokeTaskForActivation } from './runtime.js';

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
	if (!owner) throw new Error('activateTask() requires a durable task host during setup');
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

function activateOwnedTask<Args extends unknown[], Result>(
	owner: TaskOwnerRecord,
	task: TaskFunction<Args, Result>,
	inputs: { [Index in keyof Args]: ActivationInput<Args[Index]> }
): Disposable {
	const bound = bindTask(task, { owner });
	let stop: (() => void) | undefined;
	const registration: TaskActivationRegistration = {
		task,
		settled: false,
		start(skipInitial) {
			if (stop) return;
			const invoke = (activation: 'initialization' | 'reactive') => {
				const args = inputs.map((input) =>
					isReactiveValue(input) ? unwrap(input) : input
				) as Args;
				registration.settled = false;
				const invocation = peek(() => invokeTaskForActivation(task, owner, activation, args));
				void Promise.resolve(invocation).then(
					() => {
						registration.settled = true;
					},
					() => {
						registration.settled = false;
					}
				);
			};
			const sources = inputs
				.map((input) => reactiveRef(input))
				.filter((source): source is ReactiveRef => source !== undefined);
			for (const source of sources) unwrap(source);
			const stops = sources.map((source) => subscribe(source, () => invoke('reactive')));
			stop = () => {
				for (const stopInput of stops) stopInput();
			};
			if (skipInitial) registration.settled = true;
			else invoke('initialization');
		}
	};
	owner.activationRegistrations.add(registration);
	if (!owner.activationsDeferred) registration.start(false);
	let disposed = false;
	const activation: Disposable = {
		[Symbol.dispose]() {
			if (disposed) return;
			disposed = true;
			stop?.();
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
