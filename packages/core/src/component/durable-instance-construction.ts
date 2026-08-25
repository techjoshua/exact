import type { ExactCompiledComponentContract } from '../component-contracts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type {
	AnyComponentInstance,
	AnyComponentFunction,
	ComponentContextValues,
	ComponentDomain,
	ComponentFunction
} from './contracts.js';
import { ComponentInstanceImpl } from './runtime.js';
import type { CompiledComponentInstanceConstructor } from './instance-construction.js';

/** Constructs the durable record selected by a lifecycle, list, or task component artifact. */
export const constructDurableComponentInstance: CompiledComponentInstanceConstructor = (
	type: AnyComponentFunction,
	rawProps: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	ambientContexts: ComponentContextValues | undefined,
	domain: ComponentDomain,
	execution: PreparedComponentExecution | undefined,
	contract: ExactCompiledComponentContract
) =>
	new ComponentInstanceImpl(
		type,
		contract.definition.instantiate as ComponentFunction,
		rawProps,
		parent,
		ambientContexts,
		domain,
		execution,
		contract
	);
