import { peek, type ReactiveValue } from '@exactjs/reactive/framework/runtime';

import type { AnyTaskFunction, TaskContext } from './contracts.js';
import { registerTaskOwnerCleanup, type TaskActivationRegistration } from './frame-runtime.js';
import { taskOwnerForHost } from './owner-hosts.js';
import { activationInputDependency } from './dependency-source.js';
import {
	watchContinuationDependencies,
	type ContinuationDependencyWatcher
} from './dependency-watcher.js';

type ActivationInput<T> = T | ReactiveValue<T>;

/**
 * Activates synchronous compiler-owned component computation without constructing a task
 * generation. Hydration contracts contain no cross-boundary execution graph, so their ordinary
 * derived setup writes need dependency observation and lifetime ownership, but not cancellation,
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
	const registration: TaskActivationRegistration = {
		task: computation as AnyTaskFunction,
		settled: false,
		start(skipInitial) {
			if (watcher) return;
			let initial = true;
			watcher = watchContinuationDependencies(dependencies, {
				onReady(vector) {
					if (skipInitial && initial) {
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
	if (!owner.activationsDeferred) registration.start(false);
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
	return activation;
}

const computationContext = Object.freeze({ signal: new AbortController().signal });
