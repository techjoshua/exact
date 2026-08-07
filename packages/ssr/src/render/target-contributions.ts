import {
	Target,
	getCellVNode,
	isCellVNode,
	isVNode,
	normalizeClassValue,
	type ComponentInstance,
	type VNode
} from '@exactjs/core';
import { unwrap } from '@exactjs/reactive';
import type { RenderToStringOptions, SsrContext } from '../types.js';
import { prepareSsrTargetBoundary, prepareSsrTargetBoundaryAsync } from './enhancement-planning.js';
import { resolveSsrTargetBoundary } from './enhancement-routing.js';
import { resolveSsrLogicalChildren } from './logical-children.js';

const tokenListProps = new Set([
	'aria-describedby',
	'aria-labelledby',
	'aria-controls',
	'aria-owns',
	'rel'
]);

/** Plans and applies all nested `_target` layers before synchronous host serialization. */
export function applySsrTargetContributions(
	context: SsrContext,
	boundary: VNode,
	parent: ComponentInstance<any> | undefined
): void {
	prepareSsrTargetBoundary(context, boundary, parent);
	applyPreparedTargetTree(context, boundary, parent);
}

/** Plans and applies all nested `_target` layers before asynchronous host serialization. */
export async function applySsrTargetContributionsAsync(
	context: SsrContext,
	boundary: VNode,
	parent: ComponentInstance<any> | undefined,
	options: RenderToStringOptions & { taskDeadline?: number }
): Promise<void> {
	await prepareSsrTargetBoundaryAsync(context, boundary, parent, options);
	applyPreparedTargetTree(context, boundary, parent);
}

function applyPreparedTargetTree(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined
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
	for (const key of new Set([...Object.keys(base), ...Object.keys(layer)])) {
		if (key === 'children' || key === 'key' || key === 'ref' || /^on[A-Z]/.test(key)) continue;
		const authored = unwrap(base[key]);
		const contributed = unwrap(layer[key]);
		if (key === 'class' || key === 'className') {
			const tokens = `${authored == null ? '' : normalizeClassValue(authored)} ${
				contributed == null ? '' : normalizeClassValue(contributed)
			}`
				.trim()
				.split(/\s+/)
				.filter((token, index, all) => token && all.indexOf(token) === index);
			result[key] = tokens.length ? tokens.join(' ') : authored === null ? null : undefined;
			continue;
		}
		if (tokenListProps.has(key)) {
			const tokens = `${authored ?? ''} ${contributed ?? ''}`
				.trim()
				.split(/\s+/)
				.filter((token, index, all) => token && all.indexOf(token) === index);
			result[key] = tokens.length ? tokens.join(' ') : authored === null ? null : undefined;
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
