import type { ComponentDomain } from './contracts.js';

let activeDomain: ComponentDomain | undefined;

/** The default execution namespace for ordinary page-authored component instances. */
export const pageComponentDomain = createComponentDomain('page');

/** Creates immutable ownership metadata carried by VNodes and component instances. */
export function createComponentDomain(executionRoot: string): ComponentDomain {
	if (!executionRoot) throw new Error('Component execution root must be a non-empty string');
	return Object.freeze({ executionRoot });
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
