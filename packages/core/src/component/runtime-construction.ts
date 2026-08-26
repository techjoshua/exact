import {
	type ExactCompiledComponentContract,
	readExactCompiledComponentContract,
	readPreparedExactCompiledComponentContract
} from '../component-contracts.js';
import { createExactFrameworkFixtureArtifact } from '../component-contract/runtime-artifacts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ComponentFunction,
	ComponentInstance
} from './contracts.js';
import { pageComponentDomain } from './domain.js';
import type { CompiledComponentInstanceConstructor } from './instance-construction.js';

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
	domain = parent?.domain ?? pageComponentDomain,
	contract: ExactCompiledComponentContract = readPreparedExactCompiledComponentContract(type)
): ComponentInstance<State> {
	return (contract.definition.construct as CompiledComponentInstanceConstructor)(
		type,
		rawProps,
		parent,
		ambientContexts,
		domain,
		undefined,
		contract
	) as ComponentInstance<State>;
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
	const contract = readPreparedExactCompiledComponentContract(type);
	return (contract.definition.construct as CompiledComponentInstanceConstructor)(
		type,
		rawProps,
		parent,
		ambientContexts,
		domain,
		execution,
		contract
	) as ComponentInstance<State>;
}
