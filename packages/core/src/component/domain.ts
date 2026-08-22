import type {
	AnyComponentFunction,
	AnyComponentInstance,
	ComponentContinuationDispatch,
	ComponentContinuationDispatcher,
	ComponentDomain,
	ComponentDomainIdentity,
	ComponentResumptionActivation
} from './contracts.js';
import type { ExactRuntimeInspectionOwner } from './inspection.js';
import type { Logger } from '../logging.js';

let activeDomain: ComponentDomain | undefined;
const resumingDomains = new WeakMap<ComponentDomain, number>();
const domainCapabilities = new WeakMap<ComponentDomain, ComponentDomainCapabilities>();
const domainLogging = new WeakMap<ComponentDomain, ComponentDomainLogging>();
const wallClockUsedDomains = new WeakSet<ComponentDomain>();

/** Public options for creating an application-owned component domain. */
export type ComponentDomainOptions = ComponentDomainIdentity;

/** Framework-owned capabilities attached without expanding the public domain shape. */
export type ComponentDomainCapabilities = Readonly<{
	dispatchContinuation?: ComponentContinuationDispatcher;
	resumeComponent?: (type: AnyComponentFunction) => ComponentResumptionActivation | undefined;
	inspection?: ExactRuntimeInspectionOwner;
	inspectionActivation?: 'hydration';
	/** Logger shared by the framework-owned component root. */
	logger?: Logger;
	/** Immutable wall-clock sample shared by one framework-owned render transaction. */
	wallClockSnapshot?: number;
}>;

/** Shared logging state for one framework-owned component root. */
export type ComponentDomainLogging = {
	logger: Logger | undefined;
	componentOverride: boolean;
};

/** Internal construction options used by framework render and hydration boundaries. */
export type FrameworkComponentDomainOptions = ComponentDomainOptions & ComponentDomainCapabilities;

const pageComponentDomainKey = Symbol.for('@exactjs/page-component-domain');
const sharedDomains = globalThis as Record<PropertyKey, unknown>;

/** The default execution namespace for ordinary page-authored component instances. */
export const pageComponentDomain = (sharedDomains[pageComponentDomainKey] ??=
	constructComponentDomain({ executionRoot: 'page' })) as ComponentDomain;

/** Creates immutable ownership metadata carried by VNodes and component instances. */
export function createComponentDomain(options: ComponentDomainOptions): ComponentDomain {
	return constructComponentDomain(options);
}

/** Creates a component domain with capabilities reserved for framework packages. */
export function createFrameworkComponentDomain(
	options: FrameworkComponentDomainOptions
): ComponentDomain {
	const domain = constructComponentDomain(options);
	const capabilities: ComponentDomainCapabilities = Object.freeze({
		...(options.dispatchContinuation ? { dispatchContinuation: options.dispatchContinuation } : {}),
		...(options.resumeComponent ? { resumeComponent: options.resumeComponent } : {}),
		...(options.inspection ? { inspection: options.inspection } : {}),
		...(options.inspectionActivation ? { inspectionActivation: options.inspectionActivation } : {}),
		...(options.wallClockSnapshot !== undefined
			? { wallClockSnapshot: options.wallClockSnapshot }
			: {})
	});
	domainCapabilities.set(domain, capabilities);
	if (Object.prototype.hasOwnProperty.call(options, 'logger'))
		domainLogging.set(domain, {
			logger: options.logger,
			componentOverride: false
		});
	return domain;
}

/** Resolves the shared logger lane for a framework-owned root. */
export function componentDomainLogging(
	domain: ComponentDomain
): ComponentDomainLogging | undefined {
	return domainLogging.get(domain);
}

/** Updates the shared root logger without rebuilding component instances. */
export function setComponentDomainLogger(domain: ComponentDomain, logger: Logger | undefined): void {
	const logging = domainLogging.get(domain);
	if (logging) logging.logger = logger;
}

/** Selects generic context lookup after a component introduces a logger override. */
export function markComponentDomainLoggerOverride(domain: ComponentDomain): void {
	const logging = domainLogging.get(domain);
	if (logging) logging.componentOverride = true;
}

/** Returns the inspection owner attached by a framework rendering boundary. */
export function componentDomainInspection(
	domain: ComponentDomain
): ExactRuntimeInspectionOwner | undefined {
	return domainCapabilities.get(domain)?.inspection;
}

/** Returns the resumption source attached by a framework hydration boundary. */
export function componentDomainResumption(
	domain: ComponentDomain
): ComponentDomainCapabilities['resumeComponent'] {
	return domainCapabilities.get(domain)?.resumeComponent;
}

/** Reports whether a framework domain activated its root through hydration. */
export function isHydrationComponentDomain(domain: ComponentDomain): boolean {
	return domainCapabilities.get(domain)?.inspectionActivation === 'hydration';
}

/** Returns the request-owned wall-clock sample attached by a server renderer. */
export function componentDomainWallClockSnapshot(domain: ComponentDomain): number | undefined {
	return domainCapabilities.get(domain)?.wallClockSnapshot;
}

/** Marks that an optional clock capability consumed this framework domain's request sample. */
export function markComponentDomainWallClockUsed(domain: ComponentDomain): void {
	if (domainCapabilities.get(domain)?.wallClockSnapshot !== undefined)
		wallClockUsedDomains.add(domain);
}

/** Reports whether optional clock behavior consumed this framework domain's request sample. */
export function componentDomainUsesWallClock(domain: ComponentDomain): boolean {
	return wallClockUsedDomains.has(domain);
}

function constructComponentDomain(options: ComponentDomainOptions): ComponentDomain {
	if (!options.executionRoot)
		throw new Error('Component execution root must be a non-empty string');
	return Object.freeze({ executionRoot: options.executionRoot });
}

/** Advances the server continuation registered for a compiled component task. */
export function dispatchComponentContinuation<Result = void>(
	instance: AnyComponentInstance,
	id: string,
	dependencies: readonly unknown[],
	signal: AbortSignal,
	contextWrites: ComponentContinuationDispatch['contextWrites'] = [],
	generation?: number
): Promise<Result> {
	const dispatch = domainCapabilities.get(instance.domain)?.dispatchContinuation;
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
	type: AnyComponentFunction
): ComponentResumptionActivation | undefined {
	return resumingDomains.has(domain)
		? domainCapabilities.get(domain)?.resumeComponent?.(type)
		: undefined;
}

/** Returns the domain currently responsible for authored VNode creation. */
export function currentComponentDomain(): ComponentDomain | undefined {
	return activeDomain;
}
