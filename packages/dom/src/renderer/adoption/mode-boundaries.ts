import {
	normalizeActivityMode,
	normalizeRenderResult,
	unwrap,
	type Child,
	type ComponentInstance,
	type VNode
} from '@exactjs/core';
import { createEffectScope, type EffectScope } from '@exactjs/reactive';
import { placeMountedBefore } from '../../placement.js';
import type { Mounted, Root } from '../../types.js';
import { installActivity, prepareActivity } from '../activity.js';
import { mountChildren, mountDetachedChildren } from '../mounting/children.js';
import { detachMountedRanges } from '../retained-range.js';
import { commitPreparedSuspense, prepareSuspense } from '../suspense.js';
import { unmountMounted } from '../teardown.js';

type AdoptChildren = (
	root: Root,
	children: Child[],
	nodes: readonly Node[],
	parentInstance: ComponentInstance<any>,
	parentScope: EffectScope
) => Mounted[] | undefined;

/** Adopts one SSR-emitted native Activity marker range. */
export function adoptActivityBoundary(
	root: Root,
	vnode: VNode,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: ComponentInstance<any>,
	parentScope: EffectScope,
	adoptChildren: AdoptChildren
): { mounted: Mounted; next: number } | undefined {
	const scope = createEffectScope(parentScope);
	const start = nodes[cursor];
	if (!(start instanceof Comment) || !start.data.startsWith('exact:activity:')) {
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
	const contentScope = createEffectScope(scope);
	const mode = normalizeActivityMode(unwrap(vnode.props.mode));
	const mounted: Mounted = {
		vnode,
		dom: start,
		end: nodes[endIndex]!,
		scope,
		children: []
	};
	const activityOwner = prepareActivity(root, mounted, parentInstance, contentScope, mode);
	const activity = mounted.activity!;
	if (mode === 'active') {
		const children = adoptChildren(
			root,
			vnode.children,
			nodes.slice(cursor + 1, endIndex),
			activityOwner,
			contentScope
		);
		if (!children) {
			scope.stop();
			return undefined;
		}
		mounted.children = children;
	} else {
		if (endIndex !== cursor + 1) {
			scope.stop();
			return undefined;
		}
		const fragment = document.createDocumentFragment();
		mounted.children = mountChildren(root, fragment, vnode.children, activityOwner, contentScope);
		const parent = start.parentNode;
		if (!parent) {
			scope.stop();
			return undefined;
		}
		for (const child of mounted.children) placeMountedBefore(root, parent, child, mounted.end);
		activity.retained = detachMountedRanges(mounted.children);
	}
	installActivity(root, mounted);
	return { mounted, next: endIndex + 1 };
}

/** Adopts one SSR-emitted native Suspense content or fallback marker range. */
export function adoptSuspenseBoundary(
	root: Root,
	vnode: VNode,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: ComponentInstance<any>,
	parentScope: EffectScope,
	adoptChildren: AdoptChildren
): { mounted: Mounted; next: number } | undefined {
	const scope = createEffectScope(parentScope);
	const start = nodes[cursor];
	if (
		!(start instanceof Comment) ||
		(!start.data.startsWith('exact:suspense-content:') &&
			!start.data.startsWith('exact:suspense-fallback:'))
	) {
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
		children: []
	};
	prepareSuspense(root, mounted, parentInstance);
	const suspense = mounted.suspense!;
	if (start.data.startsWith('exact:suspense-content:')) {
		const children = adoptChildren(
			root,
			vnode.children,
			nodes.slice(cursor + 1, endIndex),
			suspense.owner,
			scope
		);
		if (!children || suspense.coordinator.pending) {
			unmountMounted(mounted);
			return undefined;
		}
		mounted.children = children;
		suspense.revealed = true;
	} else {
		const candidate = mountDetachedChildren(
			root,
			vnode.children,
			suspense.owner,
			scope,
			start.parentNode ?? undefined
		);
		suspense.candidate = {
			generation: suspense.coordinator.generation,
			children: candidate
		};
		const fallback = adoptChildren(
			root,
			normalizeRenderResult(unwrap(vnode.props.fallback) as Child | Child[]),
			nodes.slice(cursor + 1, endIndex),
			parentInstance,
			scope
		);
		if (!fallback) {
			unmountMounted(mounted);
			return undefined;
		}
		mounted.children = fallback;
		if (!suspense.coordinator.pending) queueMicrotask(() => commitPreparedSuspense(root, mounted));
	}
	suspense.owner.markMounted();
	return { mounted, next: endIndex + 1 };
}
