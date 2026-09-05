import type { ExactExecutableComponentContract } from '../component-contracts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ComponentDomain,
	ComponentFunction
} from './contracts.js';
import { ComponentInstanceImpl } from './runtime.js';
import type { CompiledComponentInstanceConstructor } from './instance-construction.js';

/** Constructs the durable record selected by a lifecycle, list, or task component artifact. */
export const constructDurableComponentInstance: CompiledComponentInstanceConstructor = function (
	parent: AnyComponentInstance | undefined,
	rawProps: Record<string, unknown>,
	ambientContexts: ComponentContextValues | undefined,
	domain: ComponentDomain,
	execution: PreparedComponentExecution | undefined,
	contract: ExactExecutableComponentContract
) {
	return new ComponentInstanceImpl(
		this.instantiate,
		contract.artifact.instantiate as ComponentFunction,
		rawProps,
		parent,
		ambientContexts,
		domain,
		execution,
		contract
	);
};
