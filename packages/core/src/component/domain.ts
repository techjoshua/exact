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
import { withEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';

/** Public options for creating an application-owned component domain. */
export type ComponentDomainOptions = ComponentDomainIdentity;

/** Framework-owned capabilities attached without expanding the public domain shape. */
export type ComponentDomainCapabilities = Readonly<{
	target?: 'client' | 'server';
	dispatchContinuation?: ComponentContinuationDispatcher;
	resumeComponent?: (type: AnyComponentFunction) => ComponentResumptionActivation | undefined;
	inspection?: ExactRuntimeInspectionOwner;
	inspectionActivation?: 'hydration';
	/** Immutable wall-clock sample shared by one framework-owned render transaction. */
	wallClockSnapshot?: number;
}>;

/** Shared logging state for one framework-owned component root. */
export type ComponentDomainLogging = {
	logger: Logger | undefined;
	componentOverride: boolean;
};

type StoredComponentDomainCapabilities = ComponentDomainCapabilities & {
	logging?: ComponentDomainLogging;
};

type ComponentDomainRuntimeState = {
	activeDomain?: ComponentDomain;
	resumingDomains: WeakMap<ComponentDomain, number>;
	domainCapabilities: WeakMap<ComponentDomain, StoredComponentDomainCapabilities>;
	wallClockUsedDomains: WeakSet<ComponentDomain>;
};

const componentDomainRuntimeStateKey = Symbol.for('@exactjs/component-domain.runtime-state');
const componentDomainRuntimeState: ComponentDomainRuntimeState = (() => {
	const scope = globalThis as typeof globalThis & {
		[componentDomainRuntimeStateKey]?: ComponentDomainRuntimeState;
	};
	const initial: ComponentDomainRuntimeState = {
		resumingDomains: new WeakMap(),
		domainCapabilities: new WeakMap(),
		wallClockUsedDomains: new WeakSet()
	};
	return (scope[componentDomainRuntimeStateKey] ??= initial);
})();

const { domainCapabilities, resumingDomains, wallClockUsedDomains } = componentDomainRuntimeState;

/** Internal construction options used by framework render and hydration boundaries. */
export type FrameworkComponentDomainOptions = ComponentDomainOptions &
	ComponentDomainCapabilities & { logger?: Logger };

const pageComponentDomainKey = Symbol.for('@exactjs/page-component-domain');
const sharedDomains = globalThis as Record<PropertyKey, unknown>;

/** The default execution namespace for ordinary page-authored component instances. */
export const pageComponentDomain = (sharedDomains[pageComponentDomainKey] ??=
	constructComponentDomain({ executionRoot: 'page' })) as ComponentDomain;

/** Creates immutable ownership metadata carried by operations and component instances. */
export function createComponentDomain(options: ComponentDomainOptions): ComponentDomain {
	return constructComponentDomain(options);
}

/** Creates a component domain with capabilities reserved for framework packages. */
export function createFrameworkComponentDomain(
	options: FrameworkComponentDomainOptions
): ComponentDomain {
	const domain = constructComponentDomain(options);
	const logging = Object.prototype.hasOwnProperty.call(options, 'logger')
		? { logger: options.logger, componentOverride: false }
		: undefined;
	const capabilities: StoredComponentDomainCapabilities = Object.freeze({
		...(options.target ? { target: options.target } : {}),
		...(options.dispatchContinuation ? { dispatchContinuation: options.dispatchContinuation } : {}),
		...(options.resumeComponent ? { resumeComponent: options.resumeComponent } : {}),
		...(options.inspection ? { inspection: options.inspection } : {}),
		...(options.inspectionActivation ? { inspectionActivation: options.inspectionActivation } : {}),
		...(options.wallClockSnapshot !== undefined
			? { wallClockSnapshot: options.wallClockSnapshot }
			: {}),
		...(logging ? { logging } : {})
	});
	domainCapabilities.set(domain, capabilities);
	return domain;
}

/** Returns the execution target selected by a framework-owned component root. */
export function componentDomainTarget(domain: ComponentDomain): 'client' | 'server' {
	return domainCapabilities.get(domain)?.target ?? 'client';
}

/** Resolves the shared logger lane for a framework-owned root. */
export function componentDomainLogging(
	domain: ComponentDomain
): ComponentDomainLogging | undefined {
	return domainCapabilities.get(domain)?.logging;
}

/** Updates the shared root logger without rebuilding component instances. */
export function setComponentDomainLogger(
	domain: ComponentDomain,
	logger: Logger | undefined
): void {
	const logging = domainCapabilities.get(domain)?.logging;
	if (logging) logging.logger = logger;
}

/** Selects generic context lookup after a component introduces a logger override. */
export function markComponentDomainLoggerOverride(domain: ComponentDomain): void {
	const logging = domainCapabilities.get(domain)?.logging;
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

/** Runs synchronous operation creation with an explicit immutable component domain. */
export function withComponentDomain<T>(domain: ComponentDomain, work: () => T): T {
	const previous = componentDomainRuntimeState.activeDomain;
	componentDomainRuntimeState.activeDomain = domain;
	try {
		return work();
	} finally {
		componentDomainRuntimeState.activeDomain = previous;
	}
}

/** Runs an existing operation under one component domain and reactive ownership scope. */
export function callWithComponentDomainInEffectScope<T>(
	domain: ComponentDomain,
	scope: EffectScope | undefined,
	work: () => T
): T {
	const previous = componentDomainRuntimeState.activeDomain;
	componentDomainRuntimeState.activeDomain = domain;
	try {
		return withEffectScope(scope, work);
	} finally {
		componentDomainRuntimeState.activeDomain = previous;
	}
}

/** Invokes one receiver directly while its immutable component domain is active. */
export function callWithComponentDomain<Receiver, Argument, Result>(
	domain: ComponentDomain,
	work: (this: Receiver, argument: Argument) => Result,
	receiver: Receiver,
	argument: Argument
): Result {
	const previous = componentDomainRuntimeState.activeDomain;
	componentDomainRuntimeState.activeDomain = domain;
	try {
		return work.call(receiver, argument);
	} finally {
		componentDomainRuntimeState.activeDomain = previous;
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

/** Returns the domain currently responsible for authored operation creation. */
export function currentComponentDomain(): ComponentDomain | undefined {
	return componentDomainRuntimeState.activeDomain;
}
