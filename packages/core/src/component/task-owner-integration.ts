import { readExactComponentContract } from '../component-contracts.js';
import { initializeComponentExecutionCapability } from '../tasks/component-execution-capability.js';
import type { TaskOwnerRecord } from '../tasks/frame-contracts.js';
import { taskObserverFor } from '../tasks/observers.js';
import { registerTaskOwnerHost } from '../tasks/owner-hosts.js';
import type { AnyComponentInstance } from './contracts.js';
import { componentReadinessContext } from './readiness.js';
import type { TaskObserver } from './task-observer.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';

/** Connects a new component owner to plan execution, readiness, and renderer task observation. */
export function configureComponentTaskOwner(
	instance: AnyComponentInstance,
	owner: TaskOwnerRecord,
	execution: PreparedComponentExecution | undefined,
	props: Record<string, unknown>
): TaskObserver | undefined {
	registerTaskOwnerHost(instance, owner);
	initializeComponentExecutionCapability(
		owner,
		instance,
		execution?.plan ?? readExactComponentContract(instance.type)?.execution,
		props
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
