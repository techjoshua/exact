import type { AnyComponentInstance } from '@exactjs/core';
import type {
	ExactFragmentReceiptData,
	ExactTargetReceiptData
} from '@exactjs/core/runtime/component-operations';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { afterMountedChildren } from '../placement.js';
import { mountDetachedChildren } from './mounting/children.js';
import { patchChildren } from './patching/children.js';
import { createMarker } from './root-support.js';
import { refreshTargetBoundary } from './target-capability.js';

/** Mounts one compiler-owned transparent range. */
export function mountFragmentReceipt(
	root: Root,
	receipt: ExactFragmentReceiptData,
	scope: EffectScope,
	parentInstance: AnyComponentInstance | undefined,
	parentNode: Node | undefined
): Mounted {
	const mounted: Mounted = {
		fragmentReceipt: receipt,
		dom: createMarker(root, 'fragment'),
		scope,
		children: []
	};
	mounted.children = mountDetachedChildren(
		root,
		[...receipt.children],
		parentInstance,
		scope,
		parentNode
	);
	return mounted;
}

/** Mounts one compiler-owned semantic-target range. */
export function mountTargetReceipt(
	root: Root,
	receipt: ExactTargetReceiptData,
	scope: EffectScope,
	parentInstance: AnyComponentInstance | undefined,
	parentNode: Node | undefined
): Mounted {
	const mounted: Mounted = {
		targetReceipt: receipt,
		dom: createMarker(root, 'target'),
		scope,
		children: [],
		targetBoundary: { owner: parentInstance }
	};
	mounted.children = mountDetachedChildren(
		root,
		[...receipt.children],
		parentInstance,
		scope,
		parentNode
	);
	refreshTargetBoundary(root, mounted, parentInstance);
	return mounted;
}

/** Patches one compiler-owned transparent range in place. */
export function patchFragmentReceipt(
	root: Root,
	parent: Node,
	mounted: Mounted,
	next: ExactFragmentReceiptData,
	parentInstance: AnyComponentInstance | undefined
): Mounted {
	mounted.fragmentReceipt = next;
	mounted.children = patchChildren(
		root,
		parent,
		mounted.children,
		[...next.children],
		parentInstance,
		mounted.scope,
		afterMountedChildren(mounted),
		mounted
	);
	return mounted;
}

/** Patches one compiler-owned semantic-target range in place. */
export function patchTargetReceipt(
	root: Root,
	parent: Node,
	mounted: Mounted,
	next: ExactTargetReceiptData,
	parentInstance: AnyComponentInstance | undefined
): Mounted {
	mounted.targetReceipt = next;
	mounted.children = patchChildren(
		root,
		parent,
		mounted.children,
		[...next.children],
		parentInstance,
		mounted.scope,
		afterMountedChildren(mounted),
		mounted
	);
	refreshTargetBoundary(root, mounted, parentInstance);
	return mounted;
}
