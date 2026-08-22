import type { AnyComponentInstance } from '@exactjs/core';
import { updateProps } from '../props.js';
import type { Mounted, Root } from '../types.js';

/** Optional target-contribution implementation selected by compiled artifacts that emit Target. */
export type TargetDomCapability = Readonly<{
	refreshSubtree(root: Root, mounted: Mounted, owner: AnyComponentInstance | undefined): void;
	refreshDependents(root: Root, structuralOwner: Mounted): void;
	refreshBoundary(root: Root, boundary: Mounted, owner: AnyComponentInstance | undefined): void;
	updateIntrinsic(
		root: Root,
		mounted: Mounted,
		previous: Record<string, unknown>,
		next: Record<string, unknown>
	): void;
	clearIntrinsic(mounted: Mounted): void;
}>;

let targetDomCapability: TargetDomCapability | undefined;

/** Installs target contribution behavior for the current DOM runtime instance. */
export function registerTargetDomCapability(capability: TargetDomCapability): void {
	if (targetDomCapability && targetDomCapability !== capability)
		throw new Error('Conflicting eXact target DOM capability integration');
	targetDomCapability = capability;
}

/** Refreshes an emitted Target boundary and fails closed when its capability was not selected. */
export function refreshTargetBoundary(
	root: Root,
	boundary: Mounted,
	owner: AnyComponentInstance | undefined
): void {
	if (!targetDomCapability)
		throw new Error('Target rendering is unavailable because this artifact did not include the DOM capability');
	targetDomCapability.refreshBoundary(root, boundary, owner);
}

/** Refreshes Target nodes when the optional capability is present. */
export function refreshTargetSubtree(
	root: Root,
	mounted: Mounted,
	owner: AnyComponentInstance | undefined
): void {
	targetDomCapability?.refreshSubtree(root, mounted, owner);
}

/** Refreshes Target routes affected by a structural change when present. */
export function refreshTargetDependents(root: Root, structuralOwner: Mounted): void {
	targetDomCapability?.refreshDependents(root, structuralOwner);
}

/** Applies ordinary authored props directly unless Target layers are enabled. */
export function updateTargetedIntrinsicProps(
	root: Root,
	mounted: Mounted,
	previous: Record<string, unknown>,
	next: Record<string, unknown>
): void {
	if (targetDomCapability) targetDomCapability.updateIntrinsic(root, mounted, previous, next);
	else if (mounted.dom instanceof Element) updateProps(root, mounted.dom, previous, next, mounted.scope);
}

/** Releases optional Target-owned intrinsic resources. */
export function clearTargetedIntrinsicProps(mounted: Mounted): void {
	targetDomCapability?.clearIntrinsic(mounted);
}
