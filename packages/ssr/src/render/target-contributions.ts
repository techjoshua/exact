import {
	type AnyComponentInstance,
	Target,
	TargetOverrides,
	isVNode,
	type VNode
} from '@exactjs/core';
import { getCellVNode, isCellVNode } from '@exactjs/core/framework/render-structure';
import {
	mergeTargetClassContributions,
	mergeTargetTokenContributions
} from '@exactjs/core/framework/target-contributions';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { RenderToStringOptions, SsrContext } from '../types.js';
import { ssrEnhancementPlanningCapability } from './enhancement-planning-capability.js';
import { resolveSsrTargetBoundary } from './enhancement-routing.js';
import { resolveSsrLogicalChildren } from './logical-children.js';

const tokenListProps = new Set([
	'aria-describedby',
	'aria-labelledby',
	'aria-controls',
	'aria-owns',
	'aria-flowto',
	'rel'
]);

/** Plans and applies all nested `_target` layers before synchronous host serialization. */
export function applySsrTargetContributions(
	context: SsrContext,
	boundary: VNode,
	parent: AnyComponentInstance | undefined
): void {
	ssrEnhancementPlanningCapability().prepareTarget(context, boundary, parent);
	applyPreparedTargetTree(context, boundary, parent);
}

/** Plans and applies all nested `_target` layers before asynchronous host serialization. */
export async function applySsrTargetContributionsAsync(
	context: SsrContext,
	boundary: VNode,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions & { taskDeadline?: number }
): Promise<void> {
	await ssrEnhancementPlanningCapability().prepareTargetAsync(context, boundary, parent, options);
	applyPreparedTargetTree(context, boundary, parent);
}

function applyPreparedTargetTree(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined
): void {
	if (isCellVNode(vnode)) {
		applyPreparedTargetTree(context, getCellVNode(vnode), parent);
		return;
	}
	let childParent = parent;
	let children: readonly unknown[];
	if (typeof vnode.type === 'function') {
		const prepared = context.preparedEnhancementComponents.get(vnode);
		childParent = prepared?.failed ? parent : (prepared?.instance ?? parent);
		children = prepared?.children ?? [];
	} else {
		children = resolveSsrLogicalChildren(context, vnode);
	}
	for (const child of children)
		if (isVNode(child)) applyPreparedTargetTree(context, child, childParent);
	if (vnode.type !== Target || context.appliedTargetBoundaries.has(vnode)) return;
	const target = resolveSsrTargetBoundary(context, vnode, parent);
	if (!target) return;
	const base = context.targetContributions.get(target) ?? target.props;
	context.targetContributions.set(target, composeTargetProps(base, vnode.props));
	context.appliedTargetBoundaries.add(vnode);
}

function composeTargetProps(
	base: Readonly<Record<string, unknown>>,
	layer: Readonly<Record<string, unknown>>
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...base };
	delete (result as Record<PropertyKey, unknown>)[TargetOverrides];
	const overrideValue = unwrap((layer as Readonly<Record<PropertyKey, unknown>>)[TargetOverrides]);
	const overrides = new Set(
		Array.isArray(overrideValue)
			? overrideValue.filter((key): key is string => typeof key === 'string')
			: []
	);
	for (const key of new Set([...Object.keys(base), ...Object.keys(layer)])) {
		if (key === 'children' || key === 'key' || key === 'ref' || /^on[A-Z]/.test(key)) continue;
		const authored = unwrap(base[key]);
		const contributed = unwrap(layer[key]);
		if (overrides.has(key)) {
			result[key] = contributed;
			continue;
		}
		if (key === 'class' || key === 'className') {
			result[key] = mergeTargetClassContributions([authored, contributed]);
			continue;
		}
		if (tokenListProps.has(key)) {
			result[key] = mergeTargetTokenContributions([authored, contributed]);
			continue;
		}
		if (key === 'style' && isRecord(contributed) && isRecord(authored)) {
			result[key] = { ...contributed, ...authored };
			continue;
		}
		result[key] = authored !== undefined ? authored : contributed;
	}
	return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
