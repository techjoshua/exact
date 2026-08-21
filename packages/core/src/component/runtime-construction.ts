import {
	readExactCompiledComponentContract,
	readExactComponentContract
} from '../component-contracts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ComponentFunction,
	ComponentInstance
} from './contracts.js';
import { pageComponentDomain } from './domain.js';
import { ComponentInstanceImpl } from './runtime.js';

/** Creates a legacy instance while first-party compilerless components are being migrated. */
export function createComponentInstance<
	State extends object,
	Props extends Record<string, unknown>
>(
	type: ComponentFunction<State, Props>,
	rawProps: Props,
	parent?: AnyComponentInstance,
	ambientContexts: ComponentContextValues | undefined = parent?.ambientContexts,
	domain = parent?.domain ?? pageComponentDomain
): ComponentInstance<State> {
	const contract = readExactComponentContract(type);
	const instantiate = (contract?.definition?.instantiate ?? type) as ComponentFunction<
		State,
		Props
	>;
	return new ComponentInstanceImpl(
		type,
		instantiate,
		rawProps,
		parent,
		ambientContexts,
		domain,
		undefined,
		contract
	);
}

/** Creates a native instance through mandatory compiler-owned construction wiring. */
export function createCompiledComponentInstance<
	State extends object,
	Props extends Record<string, unknown>
>(
	type: ComponentFunction<State, Props>,
	rawProps: Props,
	parent?: AnyComponentInstance,
	ambientContexts: ComponentContextValues | undefined = parent?.ambientContexts,
	domain = parent?.domain ?? pageComponentDomain
): ComponentInstance<State> {
	const contract = readExactCompiledComponentContract(type);
	return new ComponentInstanceImpl(
		type,
		contract.definition.instantiate as ComponentFunction<State, Props>,
		rawProps,
		parent,
		ambientContexts,
		domain,
		undefined,
		contract
	);
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
	const contract = readExactComponentContract(type);
	const instantiate = (contract?.definition?.instantiate ?? type) as ComponentFunction<
		State,
		Props
	>;
	return new ComponentInstanceImpl(
		type,
		instantiate,
		rawProps,
		parent,
		ambientContexts,
		domain,
		execution,
		contract
	);
}
