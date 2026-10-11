import type { AnyComponentFunction, Child } from '@exactjs/core';
import {
	createCompiledComponentReceipt,
	readCompiledComponentReceipt
} from '@exactjs/core/runtime/component-operations';
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
	const operation = createCompiledComponentReceipt(component, props, child);
	(context.enhancementProviderReferences ??= new WeakSet()).add(
		readCompiledComponentReceipt(operation)!
	);
	return operation;
}
