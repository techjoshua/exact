import type { ExactCompiledComponentContract } from '../component-contracts.js';
import type { PreparedComponentExecution } from '../tasks/component-execution-plan.js';
import type {
	AnyComponentInstance,
	AnyComponentFunction,
	ComponentContextValues,
	ComponentDomain
} from './contracts.js';
import type { CompiledComponentInstanceConstructor } from './instance-construction.js';
import { RenderComponentInstance } from './render-instance.js';

/** Constructs the compact record selected by a render-only compiled component artifact. */
export const constructRenderComponentInstance: CompiledComponentInstanceConstructor = (
	type: AnyComponentFunction,
	rawProps: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	ambientContexts: ComponentContextValues | undefined,
	domain: ComponentDomain,
	_execution: PreparedComponentExecution | undefined,
	contract: ExactCompiledComponentContract
) => new RenderComponentInstance(type, rawProps, parent, ambientContexts, domain, contract);
