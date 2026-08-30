import {
	createErrorReport,
	handleComponentError,
	handleComponentSuspension,
	normalizeRenderResult,
	unwrap,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';

/** Normalizes one compiled dynamic reader through shared suspension and error ownership. */
export function readDynamicChildren(
	read: () => unknown,
	parentInstance: AnyComponentInstance | undefined,
	label: string
): Child[] {
	try {
		return normalizeRenderResult(unwrap(read()) as Child | Child[]);
	} catch (error) {
		if (isPromiseLike(error)) {
			handleComponentSuspension(parentInstance, error);
			return [];
		}
		return dynamicFailure(error, parentInstance, label);
	}
}

/** Produces the component-owned fallback for one failed dynamic reader. */
export function dynamicFailure(
	error: unknown,
	parentInstance: AnyComponentInstance | undefined,
	label = 'dynamic-component'
): Child[] {
	const fallback = handleComponentError(
		parentInstance,
		createErrorReport(error, 'render', parentInstance, label)
	);
	return fallback ? normalizeRenderResult(fallback()) : [];
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		(typeof value === 'object' || typeof value === 'function') &&
		value !== null &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}
