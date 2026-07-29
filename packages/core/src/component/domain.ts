import type {
	ComponentContinuationDispatch,
	ComponentContinuationDispatcher,
	ComponentDomain,
	ComponentInstance,
	ComponentResumptionActivation,
	ComponentFunction
} from './contracts.js';
import type { ExactRuntimeInspectionOwner } from './inspection.js';

let activeDomain: ComponentDomain | undefined;

/** The default execution namespace for ordinary page-authored component instances. */
export const pageComponentDomain = createComponentDomain('page');

/** Creates immutable ownership metadata carried by VNodes and component instances. */
export function createComponentDomain(
	executionRoot: string,
	dispatchContinuation?: ComponentContinuationDispatcher,
	resumeComponent?: (type: ComponentFunction<any, any>) => ComponentResumptionActivation | undefined,
	inspection?: ExactRuntimeInspectionOwner,
	inspectionActivation?: ComponentDomain['inspectionActivation']
): ComponentDomain {
	if (!executionRoot) throw new Error('Component execution root must be a non-empty string');
	return Object.freeze({
		executionRoot,
		...(dispatchContinuation ? { dispatchContinuation } : {}),
		...(resumeComponent ? { resumeComponent } : {}),
		...(inspection ? { inspection } : {}),
		...(inspectionActivation ? { inspectionActivation } : {})
	});
}

/** Advances the server continuation registered for a compiled component task. */
export function dispatchComponentContinuation<Result = void>(
	instance: ComponentInstance<any>,
	id: string,
	dependencies: readonly unknown[],
	signal: AbortSignal,
	contextWrites: ComponentContinuationDispatch['contextWrites'] = [],
	generation?: number
): Promise<Result> {
	const dispatch = instance.domain.dispatchContinuation;
	if (!dispatch) throw new Error(`No eXact continuation transport is registered for ${id}`);
	return dispatch({
		instance,
		id,
		dependencies,
		contextWrites,
		signal,
		...(generation === undefined ? {} : { generation })
	}) as Promise<Result>;
}

/** Runs synchronous VNode creation with an explicit immutable component domain. */
export function withComponentDomain<T>(domain: ComponentDomain, work: () => T): T {
	const previous = activeDomain;
	activeDomain = domain;
	try {
		return work();
	} finally {
		activeDomain = previous;
	}
}

/** Returns the domain currently responsible for authored VNode creation. */
export function currentComponentDomain(): ComponentDomain | undefined {
	return activeDomain;
}
