import {
	type ExactExecutableComponentContract,
	readPreparedExactExecutableComponentContract
} from '../component-contracts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ComponentFunction,
	ComponentInstance
} from './contracts.js';
import { pageComponentDomain } from './domain.js';

/** Creates a native instance through mandatory artifact-owned construction wiring. */
export function createComponentInstance<
	State extends object,
	Props extends Record<string, unknown>
>(
	type: ComponentFunction<State, Props>,
	rawProps: Props,
	parent?: AnyComponentInstance,
	ambientContexts: ComponentContextValues | undefined = parent?.ambientContexts,
	domain = parent?.domain ?? pageComponentDomain,
	contract: ExactExecutableComponentContract = readPreparedExactExecutableComponentContract(type)
): ComponentInstance<State> {
	return contract.artifact.construct(
		parent,
		rawProps,
		ambientContexts,
		domain,
		undefined,
		contract
	) as ComponentInstance<State>;
}

/** Creates an instance using a previously validated and indexed compiler execution plan. */
export function createPreparedComponentInstance<
	State extends object,
	Props extends Record<string, unknown>
>(
	type: ComponentFunction<State, Props>,
	rawProps: Props,
	execution: PreparedComponentExecution | undefined,
	parent?: AnyComponentInstance,
	ambientContexts: ComponentContextValues | undefined = parent?.ambientContexts,
	domain = parent?.domain ?? pageComponentDomain
): ComponentInstance<State> {
	const contract = readPreparedExactExecutableComponentContract(type);
	return contract.artifact.construct(
		parent,
		rawProps,
		ambientContexts,
		domain,
		execution,
		contract
	) as ComponentInstance<State>;
}
