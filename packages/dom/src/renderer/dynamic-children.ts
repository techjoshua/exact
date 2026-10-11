import {
	createErrorReport,
	handleComponentError,
	handleComponentSuspension,
	normalizeRenderResult,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';
import { isReactiveValue } from '@exactjs/reactive/framework/values';
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
		return snapshotChildSequence(readRenderProgramSlot(invocation, index));
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

/** Resolves value wrappers while preserving observable containers and prior child membership. */
export function snapshotChildSequence(value: unknown): Child[] {
	const resolved = isReactiveValue(value) ? value.get() : value;
	const children = normalizeRenderResult(resolved as Child | Child[]);
	// A flat mutable array must not become both sides of the next identity comparison.
	return children === resolved ? children.slice() : children;
}
