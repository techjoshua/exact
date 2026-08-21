import {
	createExactFrameworkFixtureArtifact,
	readExactCompiledComponentContract
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

let nextFrameworkFixtureId = 0;

/** Creates a native instance through mandatory artifact-owned construction wiring. */
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

/** Creates an artifact-backed instance for low-level framework tests. */
export function createFrameworkFixtureComponentInstance<
	State extends object,
	Props extends Record<string, unknown>
>(
	type: ComponentFunction<State, Props>,
	rawProps: Props,
	parent?: AnyComponentInstance,
	ambientContexts: ComponentContextValues | undefined = parent?.ambientContexts,
	domain = parent?.domain ?? pageComponentDomain
): ComponentInstance<State> {
	try {
		readExactCompiledComponentContract(type);
	} catch {
		createExactFrameworkFixtureArtifact(
			type,
			`@exactjs/core:fixture:${type.name || 'anonymous'}:${++nextFrameworkFixtureId}`
		);
	}
	return createComponentInstance(type, rawProps, parent, ambientContexts, domain);
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
	const contract = readExactCompiledComponentContract(type);
	return new ComponentInstanceImpl(
		type,
		contract.definition.instantiate as ComponentFunction<State, Props>,
		rawProps,
		parent,
		ambientContexts,
		domain,
		execution,
		contract
	);
}
