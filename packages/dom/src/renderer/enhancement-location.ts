import type { AnyComponentInstance } from '@exactjs/core';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted } from '../types.js';

/** Logical owner and scope of one retained enhancement boundary. */
export type MountedLocation = {
	readonly owner?: Mounted;
	readonly parentInstance?: AnyComponentInstance;
	readonly parentScope?: EffectScope;
};

/** Finds the ownership frame used to replace a selected enhancement boundary. */
export function findMountedLocation(
	mounted: Mounted,
	target: Mounted,
	owner: Mounted | undefined,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined,
	parentNode: Node
): MountedLocation | undefined {
	if (mounted === target) return { owner, parentInstance, parentScope };
	const childInstance = mounted.instance ?? parentInstance;
	const childParent =
		mounted.portalTarget ??
		(mounted.intrinsicReceipt ? mounted.dom : (mounted.dom.parentNode ?? parentNode));
	for (const child of mounted.children) {
		const location = findMountedLocation(
			child,
			target,
			mounted,
			childInstance,
			mounted.scope,
			childParent
		);
		if (location) return location;
	}
	return undefined;
}

/** Removes one ownership edge before a surviving target is transferred out of a departed chain. */
export function detachMounted(owner: Mounted | undefined, target: Mounted): boolean {
	if (!owner) return false;
	const index = owner.children.indexOf(target);
	if (index >= 0) {
		owner.children.splice(index, 1);
		return true;
	}
	for (const child of owner.children) if (detachMounted(child, target)) return true;
	return false;
}
