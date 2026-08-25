import type { ExactCompiledComponentContract } from '../component-contracts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type {
	AnyComponentInstance,
	AnyComponentFunction,
	ComponentContextValues,
	ComponentDomain
} from './contracts.js';

/** Compiler-linked constructor signature shared by every component storage lane. */
export type CompiledComponentInstanceConstructor = (
	type: AnyComponentFunction,
	rawProps: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	ambientContexts: ComponentContextValues | undefined,
	domain: ComponentDomain,
	execution: PreparedComponentExecution | undefined,
	contract: ExactCompiledComponentContract
) => AnyComponentInstance;
