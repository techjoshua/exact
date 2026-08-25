import {
	computed,
	isReactiveValue,
	peek,
	type ReactiveValue
} from '@exactjs/reactive/framework/runtime';
import type { RenderResult, VNode } from './contracts.js';
import { createVNode } from '../vnode.js';
import { Dynamic } from '../symbols.js';

const compiledComponentOutput = Symbol.for('exact.compiled-component-output');

type CompiledComponentOutput = Readonly<{
	readonly [compiledComponentOutput]: true;
	readonly read: () => RenderResult;
}>;

/** Creates a reactive expression wrapper for compiler-generated expression boundaries. */
export function createExpression<T>(compute: () => T) {
	return computed(compute);
}

/** Reuses a reactive value forwarded through props or observes a plain computed result. */
export function createForwardedExpression<T>(compute: () => T): T | ReactiveValue<T> {
	const value = peek(compute);
	return isReactiveValue(value) ? value : computed(compute);
}

/**
 * Creates the compiler-owned reactive result for a component whose complete output is one
 * non-JSX expression. The component boundary itself owns reconciliation, so this value must not
 * introduce a nested dynamic VNode or marker range.
 */
export function createCompiledComponentOutput<T extends RenderResult>(compute: () => T): T {
	return {
		[compiledComponentOutput]: true,
		read: compute
	} as unknown as T;
}

/** Returns whether a render result is the compiler-owned value for its component boundary. */
export function isCompiledComponentOutput(value: unknown): value is CompiledComponentOutput {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as Partial<CompiledComponentOutput>)[compiledComponentOutput] === true
	);
}

/** Reads a compiler-owned component result without exposing its internal reactive record. */
export function readCompiledComponentOutput(value: CompiledComponentOutput): RenderResult {
	return value.read();
}

/** Creates a dynamic child VNode whose render result is computed reactively. */
export function createDynamicChild(
	compute: () => RenderResult,
	markerId?: string,
	mayReplaceSubtree = true
): VNode {
	return createVNode(Dynamic, {
		value: computed(compute),
		...(mayReplaceSubtree ? {} : { __exactScalarDynamic: true }),
		...(markerId ? { __exactMarkerId: markerId } : {})
	});
}
