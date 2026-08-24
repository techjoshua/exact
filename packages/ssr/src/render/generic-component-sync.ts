import { type AnyEnhancementComponentFunction } from '@exactjs/core';
import { renderInstance } from '@exactjs/core/runtime/render';
import { flushSync } from '@exactjs/reactive';
import type {
	GenericSyncSsrComponentInput,
	GenericSyncSsrComponentResult,
	GenericSyncSsrChunkInput,
	GenericSyncSsrChunkResult
} from './generic-component-capability.js';
import { createGenericSsrComponentInstance } from './generic-component-instance.js';

/** Executes synchronous durable instances only for compiler-classified generic artifacts. */
export function renderGenericComponentSync({
	context,
	vnode,
	parent,
	operations,
	rawProps,
	onInstance
}: GenericSyncSsrComponentInput): GenericSyncSsrComponentResult {
	const instance = createGenericSsrComponentInstance(
		context,
		vnode.type as AnyEnhancementComponentFunction,
		rawProps,
		parent
	);
	onInstance(instance);
	context.onComponentCreated?.(instance);
	for (let pass = 0; pass < 25; pass++) {
		const checkpoint = context.onComponentAttemptCheckpoint?.();
		let invalidated = false;
		let html: string;
		try {
			const children = renderInstance(instance, () => {
				invalidated = true;
			});
			html = operations.renderChildren(context, children, instance, true);
		} catch (error) {
			context.onComponentAttemptRollback?.(checkpoint);
			throw error;
		}
		flushSync();
		if (invalidated) {
			context.onComponentAttemptRollback?.(checkpoint);
			continue;
		}
		return { html, props: rawProps };
	}
	throw new Error('eXact SSR component did not stabilize after 25 render passes');
}

/** Materializes the durable instance used by the synchronous chunk traversal. */
export function renderGenericComponentSyncChunks({
	context,
	vnode,
	parent,
	rawProps
}: GenericSyncSsrChunkInput): GenericSyncSsrChunkResult {
	const instance = createGenericSsrComponentInstance(
		context,
		vnode.type as AnyEnhancementComponentFunction,
		rawProps,
		parent
	);
	context.onComponentCreated?.(instance);
	return {
		instance,
		children: renderInstance(instance, () => undefined),
		props: rawProps
	};
}
