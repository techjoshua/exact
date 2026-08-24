import type { VNode } from '@exactjs/core';
import type { AnyComponentInstance, RenderToStringOptions, SsrContext } from '../types.js';

type EnhancementExecutionCapability = Readonly<{
	activate(
		context: SsrContext,
		vnode: VNode,
		parent: AnyComponentInstance | undefined
	): VNode;
	activateAsync(
		context: SsrContext,
		vnode: VNode,
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions & { taskDeadline?: number }
	): Promise<VNode>;
	applyTarget(
		context: SsrContext,
		vnode: VNode,
		parent: AnyComponentInstance | undefined
	): void;
	applyTargetAsync(
		context: SsrContext,
		vnode: VNode,
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions & { taskDeadline?: number }
	): Promise<void>;
}>;

let capability: EnhancementExecutionCapability | undefined;

/** Installs SSR enhancement execution for artifacts that contain enhancement operations. */
export function registerSsrEnhancementExecutionCapability(
	next: EnhancementExecutionCapability
): void {
	capability = next;
}

/** Activates enhancements when the compiler selected their SSR capability. */
export function activateSsrEnhancements(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined
): VNode {
	return capability?.activate(context, vnode, parent) ?? vnode;
}

/** Activates enhancements asynchronously when the compiler selected their SSR capability. */
export async function activateSsrEnhancementsAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions & { taskDeadline?: number }
): Promise<VNode> {
	return capability?.activateAsync(context, vnode, parent, options) ?? vnode;
}

/** Applies compiled target contributions when enhancement execution is present. */
export function applySsrTargetContributions(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined
): void {
	capability?.applyTarget(context, vnode, parent);
}

/** Applies compiled target contributions asynchronously when enhancement execution is present. */
export async function applySsrTargetContributionsAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions & { taskDeadline?: number }
): Promise<void> {
	await capability?.applyTargetAsync(context, vnode, parent, options);
}
