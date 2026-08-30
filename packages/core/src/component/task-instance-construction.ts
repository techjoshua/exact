import type { ExactExecutableComponentContract } from '../component-contracts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type { AnyComponentInstance, ComponentContextValues, ComponentDomain } from './contracts.js';
import type { CompiledComponentInstanceConstructor } from './instance-construction.js';
import { TaskComponentInstance } from './task-instance.js';

/** Constructs the compact record selected by a task-only compiled component artifact. */
export const constructTaskComponentInstance: CompiledComponentInstanceConstructor = function (
	parent: AnyComponentInstance | undefined,
	rawProps: Record<string, unknown>,
	ambientContexts: ComponentContextValues | undefined,
	domain: ComponentDomain,
	execution: PreparedComponentExecution | undefined,
	contract: ExactExecutableComponentContract
) {
	return new TaskComponentInstance(
		this.instantiate,
		rawProps,
		parent,
		ambientContexts,
		domain,
		execution,
		contract
	);
};
