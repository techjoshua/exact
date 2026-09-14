import { peek, type ReactiveValue } from '@exactjs/reactive/framework/runtime';

import type { AnyTaskFunction, TaskContext } from './contracts.js';
import { registerTaskOwnerCleanup, type TaskActivationRegistration } from './frame-runtime.js';
import { taskOwnerForHost } from './owner-hosts.js';
import { activationInputDependency } from './dependency-source.js';
import {
	watchContinuationDependencies,
	type ContinuationDependencyWatcher
} from './dependency-watcher.js';
import type { ContinuationDependencySource } from './dependency-source.js';

type ActivationInput<T> = T | ReactiveValue<T> | ContinuationDependencySource<T>;

/**
 * Activates synchronous compiler-owned component computation without constructing a task
 * generation. Ordinary synchronous setup writes run before SSR state is restored and need
 * dependency observation and lifetime ownership, but not cancellation,
 * promises, status, scheduling policy, or task frames. Disposing the returned handle stops its
 * watcher and releases the registration from the durable host.
 */
export function activateComputationForHost<Args extends unknown[]>(
	host: object,
	computation: (...args: [...Args, Pick<TaskContext, 'signal'>]) => void,
	...inputs: { [Index in keyof Args]: ActivationInput<Args[Index]> }
): Disposable {
	const owner = taskOwnerForHost(host);
	if (!owner)
		throw new Error('activateComputationForHost() requires a registered durable task host');
	const dependencies = inputs.map(activationInputDependency);
	let watcher: ContinuationDependencyWatcher | undefined;
	let initializedDuringSetup = false;
	const registration: TaskActivationRegistration = {
		task: computation as AnyTaskFunction,
		settled: false,
		start(skipInitial) {
			if (watcher) return;
			let initial = true;
			watcher = watchContinuationDependencies(dependencies, {
				onReady(vector) {
					if ((skipInitial || initializedDuringSetup) && initial) {
						initial = false;
						registration.settled = true;
						return;
					}
					initial = false;
					peek(() => computation(...(vector.values as Args), computationContext));
					registration.settled = true;
				},
				onUnavailable() {
					registration.settled = false;
				}
			});
			watcher.evaluate();
		}
	};
	owner.activationRegistrations.add(registration);
	let disposed = false;
	const activation: Disposable = {
		[Symbol.dispose]() {
			if (disposed) return;
			disposed = true;
			watcher?.[Symbol.dispose]();
			owner.activationRegistrations.delete(registration);
			owner.ownerCleanups.delete(cleanup);
		}
	};
	const cleanup = activation[Symbol.dispose].bind(activation);
	registerTaskOwnerCleanup(owner, cleanup);
	try {
		if (owner.activationsDeferred) {
			// Reconstruct sparse omissions before the host restores authoritative SSR state. Subscribe
			// only on release so restoration writes cannot enqueue another initialization afterwards.
			const snapshots = dependencies.map((dependency) => dependency.read());
			if (snapshots.every((snapshot) => snapshot.status === 'available')) {
				peek(() =>
					computation(...(snapshots.map((snapshot) => snapshot.value) as Args), computationContext)
				);
				initializedDuringSetup = true;
				registration.settled = true;
			}
		} else registration.start(false);
	} catch (error) {
		activation[Symbol.dispose]();
		throw error;
	}
	return activation;
}

const computationContext = Object.freeze({ signal: new AbortController().signal });
