import {
	type AnyComponentInstance,
	Activity,
	Dynamic,
	Fragment,
	Suspense,
	Target,
	UnsafeHtml,
	isVNode,
	watch,
	type VNode
} from '@exactjs/core';
import { RenderProgram, isCellVNode } from '@exactjs/core/runtime/render';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { getOwnedCellVNode } from '../../cells.js';
import {
	getListBinding,
	materializeList,
	releaseRetiredListScopes,
	stopReplacedChildren,
	takeMaterializedListScope
} from '../../children.js';
import { afterMountedChildren } from '../../placement.js';
import type { Mounted, Root } from '../../types.js';
import { patchChildren } from '../patching/children.js';
import { requireUnsafeHtmlDomCapability } from '../unsafe-html-capability.js';
import { refreshTargetBoundary } from '../target-capability.js';
import { requireStructuralBoundaryCapability } from '../structural-capability.js';
import { stopFailedAdoption } from './identity.js';
import { adoptStaticChildren, adoptStaticChildrenRange, closingMarkerIndex } from './boundaries.js';
import { adoptKeyedListChildren } from './keyed.js';
import { normalizeAdoptionVNode } from './normalization.js';
import { adoptComponent } from './component.js';
import { adoptRenderProgramOrFallback } from '../render-program.js';
import { dynamicChildren } from '../dynamic.js';
import { adoptStaticLeaf } from './leaf.js';

/** Performs the adopt static mounted inner domain operation. */
export function adoptStaticMountedInner(
	root: Root,
	vnode: VNode,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance,
	parentScope: EffectScope,
	rangeEnd = nodes.length,
	omitCompilerOwnedBoundary = false
): { mounted: Mounted; next: number } | undefined {
	vnode = normalizeAdoptionVNode(root, vnode);
	const scope = takeMaterializedListScope(vnode) ?? createEffectScope(parentScope);
	if (typeof vnode.type === 'function') {
		return adoptComponent(
			root,
			vnode,
			nodes,
			cursor,
			parentInstance,
			parentScope,
			scope,
			rangeEnd,
			omitCompilerOwnedBoundary
		);
	}
	if (isCellVNode(vnode) || vnode.type === Dynamic) {
		const kind = isCellVNode(vnode) ? 'cell' : 'dynamic';
		const start = nodes[cursor];
		if (!(start instanceof Comment) || !start.data.startsWith(`exact:${kind}:`))
			return stopFailedAdoption(scope);
		const endIndex = closingMarkerIndex(nodes, cursor, start.data, rangeEnd);
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
			nodes,
			parentInstance,
			scope,
			cursor + 1,
			endIndex
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
				onSchedule:
					vnode.props.__exactScalarDynamic === true
						? undefined
						: () => stopReplacedChildren(mounted, dynamicChildren(vnode, parentInstance))
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
			rangeEnd,
			adoptStaticMountedInner,
			(rootChildren, childNodes, owner, childScope, childCursor, childEnd, component) => {
				if (component && rootChildren.length === 1 && isVNode(rootChildren[0])) {
					const first = childNodes[childCursor];
					if (first instanceof Comment && first.data.startsWith('exact:component:'))
						return adoptStaticChildren(
							root,
							[...rootChildren],
							childNodes,
							owner,
							childScope,
							childCursor,
							childEnd
						);
					const adopted = adoptStaticMountedInner(
						root,
						rootChildren[0],
						childNodes,
						childCursor,
						owner,
						childScope,
						childEnd,
						true
					);
					return adopted?.next === childEnd ? [adopted.mounted] : undefined;
				}
				return adoptStaticChildren(
					root,
					[...rootChildren],
					childNodes,
					owner,
					childScope,
					childCursor,
					childEnd
				);
			}
		);
	}
	if (vnode.type === UnsafeHtml) {
		const capability = requireUnsafeHtmlDomCapability();
		capability.assertAllowed(root);
		const start = nodes[cursor];
		if (!(start instanceof Comment) || !start.data.startsWith('exact:unsafe-html:'))
			return stopFailedAdoption(scope);
		const endIndex = closingMarkerIndex(nodes, cursor, start.data, rangeEnd);
		if (endIndex < 0) return stopFailedAdoption(scope);
		const mounted: Mounted = {
			vnode,
			dom: start,
			end: nodes[endIndex]!,
			scope,
			children: [],
			rawNodes: nodes.slice(cursor + 1, endIndex)
		};
		capability.bind(root, mounted, vnode.props.value, true);
		return { mounted, next: endIndex + 1 };
	}
	if (vnode.type === Activity) {
		scope.stop();
		return requireStructuralBoundaryCapability().adoptActivity(
			root,
			vnode,
			nodes,
			cursor,
			parentInstance,
			parentScope,
			rangeEnd,
			adoptStaticChildren
		);
	}
	if (vnode.type === Suspense) {
		scope.stop();
		return requireStructuralBoundaryCapability().adoptSuspense(
			root,
			vnode,
			nodes,
			cursor,
			parentInstance,
			parentScope,
			rangeEnd,
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
				nodes,
				parentInstance,
				scope,
				false,
				cursor,
				rangeEnd
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
			return { mounted, next: adopted.next };
		}
		const endIndex = closingMarkerIndex(nodes, cursor, start.data, rangeEnd);
		if (endIndex < 0) {
			scope.stop();
			return undefined;
		}
		const children = list
			? adoptKeyedListChildren(
					root,
					materializeList(list, scope),
					nodes,
					parentInstance,
					scope,
					cursor + 1,
					endIndex
				)
			: adoptStaticChildren(
					root,
					vnode.children,
					nodes,
					parentInstance,
					scope,
					cursor + 1,
					endIndex
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
		if (list && vnode.props.__exactProgramList !== true) {
			mounted.stop = watch(
				() => {
					const parent = start.parentNode;
					if (!parent) return;
					mounted.children = patchChildren(
						root,
						parent,
						mounted.children,
						materializeList(list, scope),
						parentInstance,
						scope,
						afterMountedChildren(mounted),
						mounted
					);
					releaseRetiredListScopes(list);
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
