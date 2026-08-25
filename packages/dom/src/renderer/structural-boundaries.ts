import { normalizeActivityMode, unwrap, type VNode } from '@exactjs/core';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { AnyComponentInstance } from '@exactjs/core';
import type { Mounted, Root } from '../types.js';
import { patchChildren } from './patching/children.js';
import { mountDetachedChildren } from './mounting/children.js';
import { createMarker } from './root-support.js';
import { installActivity, prepareActivity } from './activity.js';
import { initializeSuspense, updateSuspense } from './suspense.js';
import { adoptActivityBoundary, adoptSuspenseBoundary } from './adoption/mode-boundaries.js';
import type { StructuralBoundaryCapability } from './structural-capability.js';

/** Mounts one native Activity boundary through the optional structural capability. */
function mountActivity(
	root: Root,
	vnode: VNode,
	scope: EffectScope,
	parentInstance: AnyComponentInstance | undefined,
	parentNode: Node | undefined
): Mounted {
	const start = createMarker(root, 'activity');
	const end = createMarker(root, 'activity-end');
	const contentScope = createEffectScope(scope);
	const mounted: Mounted = { vnode, dom: start, end, scope, children: [] };
	const mode = normalizeActivityMode(unwrap(vnode.props.mode));
	const activityOwner = prepareActivity(root, mounted, parentInstance, contentScope, mode);
	mounted.children = mountDetachedChildren(
		root,
		vnode.children,
		activityOwner,
		contentScope,
		parentNode
	);
	installActivity(root, mounted);
	return mounted;
}

/** Mounts one native Suspense boundary through the optional structural capability. */
function mountSuspense(
	root: Root,
	vnode: VNode,
	scope: EffectScope,
	parentInstance: AnyComponentInstance | undefined,
	parentNode: Node | undefined
): Mounted {
	const mounted: Mounted = {
		vnode,
		dom: createMarker(root, 'suspense'),
		end: createMarker(root, 'suspense-end'),
		scope,
		children: []
	};
	initializeSuspense(root, mounted, parentInstance, parentNode);
	return mounted;
}

/** Patches one retained Activity boundary. */
function patchActivity(root: Root, parent: Node, mounted: Mounted, next: VNode): Mounted {
	const activity = mounted.activity;
	if (!activity) throw new Error('Cannot patch an Activity boundary without Activity state');
	mounted.stop?.();
	mounted.stop = undefined;
	mounted.vnode = next;
	const contentParent = activity.retained?.segments[0]?.fragment ?? parent;
	mounted.children = patchChildren(
		root,
		contentParent,
		mounted.children,
		next.children,
		activity.owner,
		activity.contentScope,
		activity.retained?.detached ? null : mounted.end,
		mounted
	);
	installActivity(root, mounted);
	return mounted;
}

/** Patches one native Suspense boundary. */
function patchSuspense(
	root: Root,
	parent: Node,
	mounted: Mounted,
	next: VNode,
	parentInstance: AnyComponentInstance | undefined
): Mounted {
	updateSuspense(root, parent, mounted, next, parentInstance);
	return mounted;
}

/** Complete coordinated Activity and Suspense implementation installed by the integration entry. */
export const structuralBoundaryCapability: StructuralBoundaryCapability = Object.freeze({
	mountActivity,
	mountSuspense,
	patchActivity,
	patchSuspense,
	adoptActivity: adoptActivityBoundary,
	adoptSuspense: adoptSuspenseBoundary
});
