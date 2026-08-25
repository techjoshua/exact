import type { ExactCompiledComponentContract } from '../component-contracts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type {
	AnyComponentInstance,
	AnyComponentFunction,
	ComponentContextValues,
	ComponentDomain
} from './contracts.js';
import type { CompiledComponentInstanceConstructor } from './instance-construction.js';
import { TaskComponentInstance } from './task-instance.js';

/** Constructs the compact record selected by a task-only compiled component artifact. */
export const constructTaskComponentInstance: CompiledComponentInstanceConstructor = (
	type: AnyComponentFunction,
	rawProps: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	ambientContexts: ComponentContextValues | undefined,
	domain: ComponentDomain,
	execution: PreparedComponentExecution | undefined,
	contract: ExactCompiledComponentContract
) =>
	new TaskComponentInstance(type, rawProps, parent, ambientContexts, domain, execution, contract);
