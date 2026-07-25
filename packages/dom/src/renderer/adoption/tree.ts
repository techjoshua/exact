import {
	Activity,
	createComponentInstance,
	Dynamic,
	Fragment,
	getCellVNode,
	isCellVNode,
	normalizeRenderResult,
	renderInstance,
	Suspense,
	Text,
	UnsafeHtml,
	unwrap,
	watch,
	type Child,
	type ComponentFunction,
	type ComponentInstance,
	type VNode
} from '@exactjs/core';
import { createEffectScope, withEffectScope, type EffectScope } from '@exactjs/reactive';
import {
	getComponentProps,
	getListBinding,
	materializeList,
	stopRemovedListChildren,
	stopReplacedChildren
} from '../../children.js';
import { describeVNodeType } from '../../debug.js';
import { setElementOwner } from '../../ownership.js';
import { afterMountedChildren } from '../../placement.js';
import { updateProps } from '../../props.js';
import type { Mounted, Root } from '../../types.js';
import { patchChildren, rerenderComponent } from '../patching/children.js';
import { ownMountedInstance } from '../root-lifecycle.js';
import { unmountMany, unmountMounted } from '../teardown.js';
import { assertUnsafeHtmlAllowed, bindUnsafeHtml } from '../unsafe-html.js';
import { adoptActivityBoundary, adoptSuspenseBoundary } from './mode-boundaries.js';
import {
	adoptStaticChildren,
	adoptStaticChildrenRange,
	authoredChildNodes,
	createRangeAnchor,
	frameworkChildRange
} from './boundaries.js';
import { adoptKeyedListChildren } from './keyed.js';
import { normalizeAdoptionVNode } from './normalization.js';

/** Performs the adopt static mounted inner domain operation. */
export function adoptStaticMountedInner(
	root: Root,
	vnode: VNode,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: ComponentInstance<any>,
	parentScope: EffectScope
): { mounted: Mounted; next: number } | undefined {
	vnode = normalizeAdoptionVNode(root, vnode);
	const scope = createEffectScope(parentScope);
	if (typeof vnode.type === 'function') {
		if (root.markerlessHydration) {
			const mounted: Mounted = { vnode, dom: undefined as never, scope, children: [] };
			try {
				const instance = withEffectScope(scope, () =>
					createComponentInstance(
						vnode.type as ComponentFunction<any, Record<string, unknown>>,
						getComponentProps(vnode),
						parentInstance,
						undefined,
						vnode.domain ?? parentInstance?.domain
					)
				);
				ownMountedInstance(mounted, instance);
				const rendered = withEffectScope(scope, () =>
					renderInstance(instance, () => rerenderComponent(root, mounted))
				);
				const adopted = adoptStaticChildrenRange(
					root,
					rendered,
					nodes.slice(cursor),
					instance,
					scope,
					false
				);
				if (!adopted || !adopted.mounts.length) {
					unmountMounted(mounted);
					throw new Error(
						`markerless component ${describeVNodeType(vnode.type)} children did not adopt`
					);
				}
				const first = adopted.mounts[0]!.dom;
				const lastMount = adopted.mounts[adopted.mounts.length - 1]!;
				const last = lastMount.end ?? lastMount.dom;
				const parent = first.parentNode;
				if (!parent || last.parentNode !== parent) {
					unmountMany(adopted.mounts);
					unmountMounted(mounted);
					throw new Error(
						`markerless component ${describeVNodeType(vnode.type)} range is disconnected`
					);
				}
				const start = createRangeAnchor(parent);
				const end = createRangeAnchor(parent);
				parent.insertBefore(start, first);
				parent.insertBefore(end, last.nextSibling);
				mounted.dom = start;
				mounted.end = end;
				mounted.children = adopted.mounts;
				instance.markMounted();
				return { mounted, next: cursor + adopted.next };
			} catch (error) {
				unmountMounted(mounted);
				throw error;
			}
		}
		const start = nodes[cursor];
		if (!(start instanceof Comment) || !start.data.startsWith('exact:component:')) {
			scope.stop();
			return undefined;
		}
		const endIndex = nodes.findIndex(
			(node, index) => index > cursor && node instanceof Comment && node.data === `/${start.data}`
		);
		if (endIndex < 0) {
			scope.stop();
			return undefined;
		}
		const mounted: Mounted = { vnode, dom: start, end: nodes[endIndex]!, scope, children: [] };
		try {
			const instance = withEffectScope(scope, () =>
				createComponentInstance(
					vnode.type as ComponentFunction<any, Record<string, unknown>>,
					getComponentProps(vnode),
					parentInstance,
					undefined,
					vnode.domain ?? parentInstance?.domain
				)
			);
			ownMountedInstance(mounted, instance);
			const rendered = withEffectScope(scope, () =>
				renderInstance(instance, () => rerenderComponent(root, mounted))
			);
			const children = adoptStaticChildren(
				root,
				rendered,
				nodes.slice(cursor + 1, endIndex),
				instance,
				scope
			);
			if (!children) {
				unmountMounted(mounted);
				return undefined;
			}
			mounted.children = children;
			instance.markMounted();
			return { mounted, next: endIndex + 1 };
		} catch {
			unmountMounted(mounted);
			return undefined;
		}
	}
	if (isCellVNode(vnode) || vnode.type === Dynamic) {
		const kind = isCellVNode(vnode) ? 'cell' : 'dynamic';
		const start = nodes[cursor];
		if (!(start instanceof Comment) || !start.data.startsWith(`exact:${kind}:`)) {
			scope.stop();
			return undefined;
		}
		const endIndex = nodes.findIndex(
			(node, index) => index > cursor && node instanceof Comment && node.data === `/${start.data}`
		);
		if (endIndex < 0) {
			scope.stop();
			return undefined;
		}
		const end = nodes[endIndex] as Comment;
		const mounted: Mounted = { vnode, dom: start, end, scope, children: [] };
		const initial = isCellVNode(vnode)
			? [getCellVNode(vnode)]
			: normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[]);
		const children = adoptStaticChildren(
			root,
			initial,
			nodes.slice(cursor + 1, endIndex),
			parentInstance,
			scope
		);
		if (!children) {
			scope.stop();
			return undefined;
		}
		mounted.children = children;
		if (isCellVNode(vnode)) {
			// Cells are patched by their owning component render; their marker range
			// still provides stable DOM ownership during hydration.
			return { mounted, next: endIndex + 1 };
		}
		const value = vnode.props.value;
		mounted.stop = watch(
			() => {
				const nextChildren = normalizeRenderResult(unwrap(value) as Child | Child[]);
				const parent = start.parentNode;
				if (!parent) return;
				mounted.children = patchChildren(
					root,
					parent,
					mounted.children,
					nextChildren,
					parentInstance,
					scope,
					afterMountedChildren(mounted)
				);
			},
			undefined,
			{
				scope,
				onSchedule: () =>
					stopReplacedChildren(mounted, normalizeRenderResult(unwrap(value) as Child | Child[]))
			}
		);
		return { mounted, next: endIndex + 1 };
	}
	if (vnode.type === UnsafeHtml) {
		assertUnsafeHtmlAllowed(root);
		const start = nodes[cursor];
		if (!(start instanceof Comment) || !start.data.startsWith('exact:unsafe-html:')) {
			scope.stop();
			return undefined;
		}
		const endIndex = nodes.findIndex(
			(node, index) => index > cursor && node instanceof Comment && node.data === `/${start.data}`
		);
		if (endIndex < 0) {
			scope.stop();
			return undefined;
		}
		const mounted: Mounted = {
			vnode,
			dom: start,
			end: nodes[endIndex]!,
			scope,
			children: [],
			rawNodes: nodes.slice(cursor + 1, endIndex)
		};
		bindUnsafeHtml(root, mounted, vnode.props.value, true);
		return { mounted, next: endIndex + 1 };
	}
	if (vnode.type === Activity) {
		scope.stop();
		return adoptActivityBoundary(
			root,
			vnode,
			nodes,
			cursor,
			parentInstance,
			parentScope,
			adoptStaticChildren
		);
	}
	if (vnode.type === Suspense) {
		scope.stop();
		return adoptSuspenseBoundary(
			root,
			vnode,
			nodes,
			cursor,
			parentInstance,
			parentScope,
			adoptStaticChildren
		);
	}
	if (vnode.type === Fragment) {
		const start = nodes[cursor];
		const list = getListBinding(vnode);
		const isListMarker = list && start instanceof Comment && start.data.startsWith('exact:');
		if (
			!(start instanceof Comment) ||
			(!start.data.startsWith('exact:fragment:') && !isListMarker)
		) {
			const adopted = adoptStaticChildrenRange(
				root,
				vnode.children,
				nodes.slice(cursor),
				parentInstance,
				scope,
				false
			);
			if (!adopted) {
				scope.stop();
				return undefined;
			}
			const children = adopted.mounts;
			const marker = document.createTextNode('');
			const first = nodes[cursor];
			if (!first?.parentNode) {
				scope.stop();
				return undefined;
			}
			first.parentNode.insertBefore(marker, first);
			return { mounted: { vnode, dom: marker, scope, children }, next: cursor + adopted.next };
		}
		const endIndex = nodes.findIndex(
			(node, index) => index > cursor && node instanceof Comment && node.data === `/${start.data}`
		);
		if (endIndex < 0) {
			scope.stop();
			return undefined;
		}
		const children = list
			? adoptKeyedListChildren(
					root,
					materializeList(list),
					nodes.slice(cursor + 1, endIndex),
					parentInstance,
					scope
				)
			: adoptStaticChildren(
					root,
					vnode.children,
					nodes.slice(cursor + 1, endIndex),
					parentInstance,
					scope
				);
		if (!children) {
			scope.stop();
			return undefined;
		}
		const mounted: Mounted = { vnode, dom: start, end: nodes[endIndex]!, scope, children };
		if (list) {
			mounted.stop = watch(
				() => {
					const parent = start.parentNode;
					if (!parent) return;
					mounted.children = patchChildren(
						root,
						parent,
						mounted.children,
						materializeList(list),
						parentInstance,
						scope,
						afterMountedChildren(mounted)
					);
				},
				undefined,
				{ scope, onSchedule: () => stopRemovedListChildren(mounted, list) }
			);
		}
		return { mounted, next: endIndex + 1 };
	}
	const node = nodes[cursor];
	if (!node) {
		scope.stop();
		return undefined;
	}
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
	updateProps(root, node, {}, vnode.props, scope);
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
