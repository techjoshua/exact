import { readExactComponentContract } from '../component-contracts.js';
import { initializeComponentExecution } from '../tasks/component-execution.js';
import type { TaskOwnerRecord } from '../tasks/frame-contracts.js';
import { taskObserverFor } from '../tasks/observers.js';
import { registerTaskOwnerHost } from '../tasks/owner-hosts.js';
import type { ComponentInstance } from './contracts.js';
import { componentReadinessContext } from './readiness.js';
import type { TaskObserver } from './task-observer.js';

/** Connects a new component owner to plan execution, readiness, and renderer task observation. */
export function configureComponentTaskOwner(
	instance: ComponentInstance<any>,
	owner: TaskOwnerRecord
): TaskObserver | undefined {
	registerTaskOwnerHost(instance, owner);
	initializeComponentExecution(
		owner,
		instance,
		readExactComponentContract(instance.type)?.execution
	);
	const readiness = componentReadinessContext(instance);
	if (readiness)
		owner.registerReadiness = (taskGeneration, settlement, commit, discard) =>
			readiness.register({ owner: instance, taskGeneration, settlement, commit, discard });
	const observer = taskObserverFor(instance);
	if (observer) owner.observeSettlement = (settlement) => observer.register(settlement, instance);
	if (observer?.runTask) owner.runTask = observer.runTask;
	return observer;
}
