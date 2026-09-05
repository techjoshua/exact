import type { ExactExecutableComponentContract } from '../component-contracts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type { AnyComponentFunction, AnyComponentInstance } from './contracts.js';

/** Opaque task capability state retained only by components whose task runtime is reachable. */
export type ComponentTaskCapabilityState = Readonly<{
	owner: unknown;
	observer?: unknown;
}>;

/** Capability-local bridge installed by the task runtime without a reverse kernel import. */
export type ComponentTaskCapability = Readonly<{
	create(
		instance: AnyComponentInstance,
		type: AnyComponentFunction,
		contract: ExactExecutableComponentContract | undefined,
		execution: PreparedComponentExecution | undefined,
		props: Record<string, unknown>,
		resuming: boolean
	): ComponentTaskCapabilityState | undefined;
	run<T>(state: ComponentTaskCapabilityState | undefined, operation: () => T): T;
	resume(state: ComponentTaskCapabilityState | undefined, settled: ReadonlySet<string>): void;
	retain(state: ComponentTaskCapabilityState | undefined, instance: AnyComponentInstance): void;
	release(state: ComponentTaskCapabilityState | undefined, instance: AnyComponentInstance): void;
}>;

let taskCapability: ComponentTaskCapability | undefined;

/** Installs the task integration when a generated task import is actually reachable. */
export function registerComponentTaskCapability(capability: ComponentTaskCapability): void {
	if (taskCapability && taskCapability !== capability)
		throw new Error('Conflicting eXact component task capability integration');
	taskCapability = capability;
}

/** Returns the reachable task integration, if this artifact contains task support. */
export function componentTaskCapability(): ComponentTaskCapability | undefined {
	return taskCapability;
}
