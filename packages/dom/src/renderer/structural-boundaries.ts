import { normalizeActivityMode, unwrap } from '@exactjs/core';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { AnyComponentInstance } from '@exactjs/core';
import type {
	ExactActivityReceiptData,
	ExactSuspenseReceiptData
} from '@exactjs/core/runtime/component-operations';
import type { Mounted, Root } from '../types.js';
import { patchChildren } from './patching/children.js';
import { mountDetachedChildren } from './mounting/children.js';
import { createMarker } from './root-support.js';
import { installActivity, prepareActivity } from './activity.js';
import { initializeSuspense, updateSuspense } from './suspense.js';
import {
	adoptActivityReceiptBoundary,
	adoptSuspenseReceiptBoundary
} from './adoption/mode-boundaries.js';
import type { StructuralBoundaryCapability } from './structural-capability.js';

/** Mounts one compiler-issued Activity operation. */
function mountActivityReceipt(
	root: Root,
	receipt: ExactActivityReceiptData,
	scope: EffectScope,
	parentInstance: AnyComponentInstance | undefined,
	parentNode: Node | undefined
): Mounted {
	const start = createMarker(root, 'activity');
	const end = createMarker(root, 'activity-end');
	const contentScope = createEffectScope(scope);
	const mounted: Mounted = { activityReceipt: receipt, dom: start, end, scope, children: [] };
	const mode = normalizeActivityMode(unwrap(receipt.props.mode));
	const activityOwner = prepareActivity(root, mounted, parentInstance, contentScope, mode);
	mounted.children = mountDetachedChildren(
		root,
		[...receipt.children],
		activityOwner,
		contentScope,
		parentNode
	);
	installActivity(root, mounted);
	return mounted;
}

/** Mounts one compiler-issued Suspense operation. */
function mountSuspenseReceipt(
	root: Root,
	receipt: ExactSuspenseReceiptData,
	scope: EffectScope,
	parentInstance: AnyComponentInstance | undefined,
	parentNode: Node | undefined
): Mounted {
	const mounted: Mounted = {
		suspenseReceipt: receipt,
		dom: createMarker(root, 'suspense'),
		end: createMarker(root, 'suspense-end'),
		scope,
		children: []
	};
	initializeSuspense(root, mounted, parentInstance, parentNode);
	return mounted;
}

/** Patches one retained compiler-issued Activity operation without creating renderer topology. */
function patchActivityReceipt(
	root: Root,
	parent: Node,
	mounted: Mounted,
	next: ExactActivityReceiptData
): Mounted {
	const activity = mounted.activity;
	if (!activity) throw new Error('Cannot patch an Activity boundary without Activity state');
	mounted.stop?.();
	mounted.stop = undefined;
	mounted.activityReceipt = next;
	const contentParent = activity.retained?.segments[0]?.fragment ?? parent;
	mounted.children = patchChildren(
		root,
		contentParent,
		mounted.children,
		[...next.children],
		activity.owner,
		activity.contentScope,
		activity.retained?.detached ? null : mounted.end,
		mounted
	);
	installActivity(root, mounted);
	return mounted;
}

/** Patches one compiler-issued Suspense operation through the retained readiness owner. */
function patchSuspenseReceipt(
	root: Root,
	parent: Node,
	mounted: Mounted,
	next: ExactSuspenseReceiptData,
	parentInstance: AnyComponentInstance | undefined
): Mounted {
	updateSuspense(root, parent, mounted, next, parentInstance);
	return mounted;
}

/** Complete coordinated Activity and Suspense implementation installed by the integration entry. */
export const structuralBoundaryCapability: StructuralBoundaryCapability = Object.freeze({
	mountActivityReceipt,
	mountSuspenseReceipt,
	patchActivityReceipt,
	patchSuspenseReceipt,
	adoptActivityReceipt: adoptActivityReceiptBoundary,
	adoptSuspenseReceipt: adoptSuspenseReceiptBoundary
});
