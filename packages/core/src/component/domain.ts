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
const resumingDomains = new WeakMap<ComponentDomain, number>();

/** The default execution namespace for ordinary page-authored component instances. */
export const pageComponentDomain = createComponentDomain('page');

/** Creates immutable ownership metadata carried by VNodes and component instances. */
export function createComponentDomain(
	executionRoot: string,
	dispatchContinuation?: ComponentContinuationDispatcher,
	resumeComponent?: (
		type: ComponentFunction<any, any>
	) => ComponentResumptionActivation | undefined,
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

/** Runs component construction with permission to consume this domain's SSR activation. */
export function withComponentResumption<T>(domain: ComponentDomain, work: () => T): T {
	const depth = resumingDomains.get(domain) ?? 0;
	resumingDomains.set(domain, depth + 1);
	try {
		return work();
	} finally {
		if (depth === 0) resumingDomains.delete(domain);
		else resumingDomains.set(domain, depth);
	}
}

/** Resolves SSR state only for construction explicitly authorized by an adoption boundary. */
export function resolveComponentResumption(
	domain: ComponentDomain,
	type: ComponentFunction<any, any>
): ComponentResumptionActivation | undefined {
	return resumingDomains.has(domain) ? domain.resumeComponent?.(type) : undefined;
}

/** Returns the domain currently responsible for authored VNode creation. */
export function currentComponentDomain(): ComponentDomain | undefined {
	return activeDomain;
}
