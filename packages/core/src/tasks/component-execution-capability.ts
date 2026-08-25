import type { AnyComponentInstance } from '../component/contracts.js';
import type { ExactComponentExecutionContract } from '../component-contracts.js';
import type { TaskFunction } from './contracts.js';
import type { ComponentContinuationOutputs } from './component-execution.js';
import type { ContinuationDependencySource } from './dependency-source.js';
import type { TaskOwnerRecord } from './frame-contracts.js';

type ComponentExecutionCapability = Readonly<{
	initialize(
		owner: TaskOwnerRecord,
		host: { readonly state?: object },
		plan: ExactComponentExecutionContract | undefined,
		props: Record<string, unknown>
	): void;
	dependencies<Args extends unknown[]>(
		owner: TaskOwnerRecord,
		task: TaskFunction<Args, unknown>,
		authored: { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> }
	): { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> };
	outputs<Args extends unknown[]>(
		owner: TaskOwnerRecord,
		task: TaskFunction<Args, unknown>
	): ComponentContinuationOutputs | undefined;
}>;

let capability: ComponentExecutionCapability | undefined;

/** Installs the execution-plan runtime selected by a compiler-generated runtime entry. */
export function registerComponentExecutionCapability(next: ComponentExecutionCapability): void {
	capability = next;
}

/** Initializes execution slots when the selected artifact retained an execution plan. */
export function initializeComponentExecutionCapability(
	owner: TaskOwnerRecord,
	instance: AnyComponentInstance,
	execution: ExactComponentExecutionContract | undefined,
	props: Record<string, unknown>
): void {
	capability?.initialize(owner, instance, execution, props);
}

/** Resolves compiler-planned inputs or preserves the authored dependency sources. */
export function componentExecutionDependencies<Args extends unknown[]>(
	owner: TaskOwnerRecord,
	task: TaskFunction<Args, unknown>,
	authored: { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> }
): { [Index in keyof Args]: ContinuationDependencySource<Args[Index]> } {
	return capability?.dependencies(owner, task, authored) ?? authored;
}

/** Begins compiler-planned output publication when an execution plan is installed. */
export function componentExecutionOutputs<Args extends unknown[]>(
	owner: TaskOwnerRecord,
	task: TaskFunction<Args, unknown>
): ComponentContinuationOutputs | undefined {
	return capability?.outputs(owner, task);
}
