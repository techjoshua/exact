import {
	Activity,
	Dynamic,
	Fragment,
	RenderProgram,
	isCellVNode,
	normalizeRenderResult,
	renderInstance,
	Suspense,
	Target,
	UnsafeHtml,
	unwrap,
	watch,
	type Child,
	type ComponentInstance,
	type VNode
} from '@exactjs/core';
import { createEffectScope, withEffectScope, type EffectScope } from '@exactjs/reactive';
import { getOwnedCellVNode } from '../../cells.js';
import { getListBinding, materializeList, stopReplacedChildren } from '../../children.js';
import { describeVNodeType } from '../../debug.js';
import { afterMountedChildren } from '../../placement.js';
import type { Mounted, Root } from '../../types.js';
import { patchChildren, rerenderComponent } from '../patching/children.js';
import { ownMountedInstance } from '../root-lifecycle.js';
import { refreshComponentRoot } from '../component-roots.js';
import { unmountMany, unmountMounted } from '../teardown.js';
import { assertUnsafeHtmlAllowed, bindUnsafeHtml } from '../unsafe-html.js';
import { refreshTargetBoundary } from '../target-contributions.js';
import { adoptActivityBoundary, adoptSuspenseBoundary } from './mode-boundaries.js';
import {
	componentMarkerBoundary,
	recoverMismatchedComponentRange,
	stopFailedAdoption
} from './identity.js';
import {
	adoptStaticChildren,
	adoptStaticChildrenRange,
	closingMarkerIndex,
	createRangeAnchor
} from './boundaries.js';
import { adoptKeyedListChildren } from './keyed.js';
import { normalizeAdoptionVNode } from './normalization.js';
import { constructAdoptedComponent } from './construction.js';
import { adoptRenderProgramOrFallback } from '../render-program.js';
import { dynamicChildren } from '../dynamic.js';
import { adoptStaticLeaf } from './leaf.js';

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
					constructAdoptedComponent(vnode, parentInstance)
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
				refreshComponentRoot(instance);
				instance.markMounted();
				return { mounted, next: cursor + adopted.next };
			} catch (error) {
				unmountMounted(mounted);
				throw error;
			}
		}
		const boundary = componentMarkerBoundary(nodes, cursor, vnode.type);
		if (!boundary) return stopFailedAdoption(scope);
		const { start, endIndex } = boundary;
		if (!boundary.matches) {
			return recoverMismatchedComponentRange(
				root,
				vnode,
				nodes,
				cursor,
				endIndex,
				parentInstance,
				parentScope,
				scope
			);
		}
		const mounted: Mounted = { vnode, dom: start, end: nodes[endIndex]!, scope, children: [] };
		try {
			const instance = withEffectScope(scope, () =>
				constructAdoptedComponent(vnode, parentInstance)
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
			refreshComponentRoot(instance);
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
		if (!(start instanceof Comment) || !start.data.startsWith(`exact:${kind}:`))
			return stopFailedAdoption(scope);
		const endIndex = closingMarkerIndex(nodes, cursor, start.data);
		if (endIndex < 0) return stopFailedAdoption(scope);
		const end = nodes[endIndex] as Comment;
		const mounted: Mounted = { vnode, dom: start, end, scope, children: [] };
		const initial = isCellVNode(vnode)
			? [getOwnedCellVNode(vnode)]
			: vnode.props.__exactDynamicComponent
				? []
				: dynamicChildren(vnode, parentInstance);
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
		mounted.stop = watch(
			() => {
				const nextChildren = dynamicChildren(vnode, parentInstance);
				const parent = start.parentNode;
				if (!parent) return;
				mounted.children = patchChildren(
					root,
					parent,
					mounted.children,
					nextChildren,
					parentInstance,
					scope,
					afterMountedChildren(mounted),
					mounted
				);
			},
			undefined,
			{
				scope,
				onSchedule: () =>
					stopReplacedChildren(mounted, dynamicChildren(vnode, parentInstance))
			}
		);
		return { mounted, next: endIndex + 1 };
	}
	if (vnode.type === RenderProgram) {
		return adoptRenderProgramOrFallback(
			root,
			vnode,
			nodes,
			cursor,
			parentInstance,
			parentScope,
			scope,
			adoptStaticMountedInner
		);
	}
	if (vnode.type === UnsafeHtml) {
		assertUnsafeHtmlAllowed(root);
		const start = nodes[cursor];
		if (!(start instanceof Comment) || !start.data.startsWith('exact:unsafe-html:'))
			return stopFailedAdoption(scope);
		const endIndex = closingMarkerIndex(nodes, cursor, start.data);
		if (endIndex < 0) return stopFailedAdoption(scope);
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
	if (vnode.type === Fragment || vnode.type === Target) {
		const start = nodes[cursor];
		const list = vnode.type === Fragment ? getListBinding(vnode) : undefined;
		const isListMarker = list && start instanceof Comment && start.data.startsWith('exact:');
		if (
			!(start instanceof Comment) ||
			(!start.data.startsWith(`exact:${vnode.type === Target ? 'target' : 'fragment'}:`) &&
				!isListMarker)
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
			const mounted: Mounted = {
				vnode,
				dom: marker,
				scope,
				children,
				...(vnode.type === Target ? { targetBoundary: {} } : {})
			};
			if (vnode.type === Target) refreshTargetBoundary(root, mounted, parentInstance);
			return { mounted, next: cursor + adopted.next };
		}
		const endIndex = closingMarkerIndex(nodes, cursor, start.data);
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
		const mounted: Mounted = {
			vnode,
			dom: start,
			end: nodes[endIndex]!,
			scope,
			children,
			...(vnode.type === Target ? { targetBoundary: {} } : {})
		};
		if (vnode.type === Target) refreshTargetBoundary(root, mounted, parentInstance);
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
						afterMountedChildren(mounted),
						mounted
					);
				},
				undefined,
				{ scope }
			);
		}
		return { mounted, next: endIndex + 1 };
	}
	const node = nodes[cursor];
	if (!node) {
		scope.stop();
		return undefined;
	}
	return adoptStaticLeaf(root, vnode, node, nodes, cursor, parentInstance, scope);
}
