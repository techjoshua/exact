import {
	readExactExecutableComponentContract,
	readPreparedExactComponentContract
} from '../component-contracts.js';
import { createExactFrameworkFixtureArtifact } from './runtime-artifacts.js';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ComponentFunction,
	ComponentInstance
} from '../component/contracts.js';
import { pageComponentDomain } from '../component/domain.js';
import { createComponentInstance } from '../component/runtime-construction.js';

let nextFrameworkFixtureId = 0;

/** Creates an artifact-backed instance solely for explicit low-level framework fixtures. */
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
		readExactExecutableComponentContract(type);
	} catch {
		const role = readPreparedExactComponentContract(type)?.role;
		const target = role === 'render' || role === 'executor' ? 'server' : 'client';
		createExactFrameworkFixtureArtifact(
			type,
			`@exactjs/core:fixture:${type.name || 'anonymous'}:${++nextFrameworkFixtureId}`,
			target
		);
	}
	return createComponentInstance(type, rawProps, parent, ambientContexts, domain);
}

export {
	createExactCompatibilityArtifact,
	createExactCompiledDynamicBoundaryArtifact,
	createExactFrameworkFixtureArtifact,
	createExactInternalOwnerArtifact
} from './runtime-artifacts.js';
