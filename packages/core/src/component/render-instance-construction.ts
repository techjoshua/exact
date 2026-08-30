import type { ExactExecutableComponentContract } from '../component-contracts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type { AnyComponentInstance, ComponentContextValues, ComponentDomain } from './contracts.js';
import type { CompiledComponentInstanceConstructor } from './instance-construction.js';
import { RenderComponentInstance } from './render-instance.js';

/** Constructs the compact record selected by a render-only compiled component artifact. */
export const constructRenderComponentInstance: CompiledComponentInstanceConstructor = function (
	parent: AnyComponentInstance | undefined,
	rawProps: Record<string, unknown>,
	ambientContexts: ComponentContextValues | undefined,
	domain: ComponentDomain,
	_execution: PreparedComponentExecution | undefined,
	contract: ExactExecutableComponentContract
) {
	return new RenderComponentInstance(
		this.instantiate,
		rawProps,
		parent,
		ambientContexts,
		domain,
		contract
	);
};
