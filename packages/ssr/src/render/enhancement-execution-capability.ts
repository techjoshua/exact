import type { VNode } from '@exactjs/core';
import type { AnyComponentInstance, RenderToStringOptions, SsrContext } from '../types.js';
import { realmSsrCapability, registerRealmSsrCapability } from './realm-capability.js';

type EnhancementExecutionCapability = Readonly<{
	activate(context: SsrContext, vnode: VNode, parent: AnyComponentInstance | undefined): VNode;
	activateAsync(
		context: SsrContext,
		vnode: VNode,
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions & { taskDeadline?: number }
	): Promise<VNode>;
	applyTarget(context: SsrContext, vnode: VNode, parent: AnyComponentInstance | undefined): void;
	applyTargetAsync(
		context: SsrContext,
		vnode: VNode,
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions & { taskDeadline?: number }
	): Promise<void>;
}>;

const capabilityName = 'enhancement-execution';

/** Installs SSR enhancement execution for artifacts that contain enhancement operations. */
export function registerSsrEnhancementExecutionCapability(
	next: EnhancementExecutionCapability
): void {
	registerRealmSsrCapability(capabilityName, next);
}

/** Activates enhancements when the compiler selected their SSR capability. */
export function activateSsrEnhancements(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined
): VNode {
	const capability = realmSsrCapability<EnhancementExecutionCapability>(capabilityName);
	return capability?.activate(context, vnode, parent) ?? vnode;
}

/** Activates enhancements asynchronously when the compiler selected their SSR capability. */
export async function activateSsrEnhancementsAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions & { taskDeadline?: number }
): Promise<VNode> {
	const capability = realmSsrCapability<EnhancementExecutionCapability>(capabilityName);
	return capability?.activateAsync(context, vnode, parent, options) ?? vnode;
}

/** Applies compiled target contributions when enhancement execution is present. */
export function applySsrTargetContributions(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined
): void {
	const capability = realmSsrCapability<EnhancementExecutionCapability>(capabilityName);
	capability?.applyTarget(context, vnode, parent);
}

/** Applies compiled target contributions asynchronously when enhancement execution is present. */
export async function applySsrTargetContributionsAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions & { taskDeadline?: number }
): Promise<void> {
	const capability = realmSsrCapability<EnhancementExecutionCapability>(capabilityName);
	await capability?.applyTargetAsync(context, vnode, parent, options);
}
