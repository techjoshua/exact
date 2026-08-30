import type { ExactExecutableComponentContract } from '../component-contracts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type {
	AnyComponentInstance,
	AnyComponentFunction,
	ComponentContextValues,
	ComponentDomain
} from './contracts.js';

/** Compiler-linked constructor signature shared by every component storage lane. */
export type CompiledComponentInstanceConstructor = (
	this: Readonly<{ instantiate: AnyComponentFunction }>,
	parent: AnyComponentInstance | undefined,
	rawProps: Record<string, unknown>,
	ambientContexts: ComponentContextValues | undefined,
	domain: ComponentDomain,
	execution: PreparedComponentExecution | undefined,
	contract: ExactExecutableComponentContract
) => AnyComponentInstance;
