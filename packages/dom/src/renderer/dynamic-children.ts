import {
	createErrorReport,
	handleComponentError,
	handleComponentSuspension,
	normalizeRenderResult,
	unwrap,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';
import {
	readRenderProgramSlot,
	type ExactRenderProgramInvocation
} from '@exactjs/core/runtime/render-operations';

/** Reads one compiler-selected structural slot without allocating a reader closure. */
export function readCompiledDynamicChildren(
	invocation: ExactRenderProgramInvocation,
	index: number,
	parentInstance: AnyComponentInstance | undefined,
	label: string
): Child[] {
	try {
		return normalizeRenderResult(
			unwrap(readRenderProgramSlot(invocation, index)) as Child | Child[]
		);
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
