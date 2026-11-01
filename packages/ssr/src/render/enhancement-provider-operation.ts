import type { AnyComponentFunction, Child } from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import type { SsrContext } from '../types.js';

/**
 * Issues a renderer-selected enhancement provider without manufacturing an island.
 * Its activation belongs to the enhanced target's client owner. Request-local receipt
 * identity distinguishes this use from an authored invocation of the same component.
 */
export function createSsrEnhancementOperation(
	context: SsrContext,
	component: AnyComponentFunction,
	props: Record<string, unknown>,
	child: Child
) {
	const operation = createCompiledComponentInputReceipt(component, props, {
		kind: 'eager',
		values: [child]
	});
	(context.enhancementProviderReferences ??= new WeakSet()).add(operation);
	return operation;
}
