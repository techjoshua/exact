import { type AnyComponentInstance, type VNode } from '@exactjs/core';
import { renderInstance } from '@exactjs/core/runtime/render';
import { withEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { describeVNodeType } from '../../debug.js';
import type { Mounted, Root } from '../../types.js';
import { rerenderComponent } from '../patching/children.js';
import { refreshComponentRoot } from '../component-roots.js';
import { ownMountedInstance } from '../root-lifecycle.js';
import { unmountMany, unmountMounted } from '../teardown.js';
import { adoptStaticChildren, adoptStaticChildrenRange, createRangeAnchor } from './boundaries.js';
import { constructAdoptedComponent } from './construction.js';
import {
	componentMarkerBoundary,
	recoverMismatchedComponentRange,
	stopFailedAdoption
} from './identity.js';

/** Adopts one compiled component through its markerless or marker-bounded ownership range. */
export function adoptComponent(
	root: Root,
	vnode: VNode,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance,
	parentScope: EffectScope,
	scope: EffectScope,
	rangeEnd: number,
	omitCompilerOwnedBoundary: boolean
): { mounted: Mounted; next: number } | undefined {
	if (root.markerlessHydration || omitCompilerOwnedBoundary)
		return adoptMarkerlessComponent(root, vnode, nodes, cursor, parentInstance, scope, rangeEnd);
	const boundary = componentMarkerBoundary(nodes, cursor, vnode.type, rangeEnd);
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
			constructAdoptedComponent(vnode, parentInstance, root.ambientContexts)
		);
		ownMountedInstance(mounted, instance);
		const rendered = withEffectScope(scope, () =>
			renderInstance(instance, () => rerenderComponent(root, mounted))
		);
		const children = adoptStaticChildren(
			root,
			rendered,
			nodes,
			instance,
			scope,
			cursor + 1,
			endIndex
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

function adoptMarkerlessComponent(
	root: Root,
	vnode: VNode,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance,
	scope: EffectScope,
	rangeEnd: number
): { mounted: Mounted; next: number } {
	const mounted: Mounted = { vnode, dom: undefined as never, scope, children: [] };
	try {
		const instance = withEffectScope(scope, () =>
			constructAdoptedComponent(vnode, parentInstance, root.ambientContexts)
		);
		ownMountedInstance(mounted, instance);
		const rendered = withEffectScope(scope, () =>
			renderInstance(instance, () => rerenderComponent(root, mounted))
		);
		const adopted = adoptStaticChildrenRange(
			root,
			rendered,
			nodes,
			instance,
			scope,
			false,
			cursor,
			rangeEnd
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
		return { mounted, next: adopted.next };
	} catch (error) {
		unmountMounted(mounted);
		throw error;
	}
}
