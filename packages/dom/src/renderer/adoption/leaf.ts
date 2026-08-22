import { type AnyComponentInstance, Text, type VNode } from '@exactjs/core';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import { setElementOwner } from '../../ownership.js';
import { updateProps } from '../../props.js';
import type { Mounted, Root } from '../../types.js';
import { adoptStaticChildren, authoredChildNodes, frameworkChildRange } from './boundaries.js';

/** Adopts one text or intrinsic leaf after structural vnode cases are exhausted. */
export function adoptStaticLeaf(
	root: Root,
	vnode: VNode,
	node: Node,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance,
	scope: EffectScope
): { mounted: Mounted; next: number } | undefined {
	if (vnode.type === Text) {
		if (node.nodeType !== Node.TEXT_NODE || node.textContent !== String(vnode.props.value ?? '')) {
			scope.stop();
			return undefined;
		}
		const separator =
			root.markerlessHydration &&
			nodes[cursor + 1] instanceof Comment &&
			(nodes[cursor + 1] as Comment).data === ' '
				? nodes[cursor + 1]
				: undefined;
		return {
			mounted: { vnode, dom: node, ...(separator ? { end: separator } : {}), scope, children: [] },
			next: cursor + (separator ? 2 : 1)
		};
	}
	if (
		typeof vnode.type !== 'string' ||
		!(node instanceof Element) ||
		node.tagName.toLowerCase() !== vnode.type.toLowerCase()
	) {
		scope.stop();
		return undefined;
	}
	const framework = frameworkChildRange(node);
	const children = adoptStaticChildren(
		root,
		vnode.children,
		authoredChildNodes(node, framework),
		parentInstance,
		scope
	);
	if (!children) {
		scope.stop();
		return undefined;
	}
	setElementOwner(node, parentInstance);
	// Hydration already snapshots browser-owned focus and form state around the complete adoption.
	// Avoid repeating document focus inspection for every retained intrinsic.
	updateProps(root, node, {}, vnode.props, scope, false);
	return {
		mounted: {
			vnode,
			dom: node,
			scope,
			children,
			...(framework ? { childEnd: framework.start } : {})
		},
		next: cursor + 1
	};
}
