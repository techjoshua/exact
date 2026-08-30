import type { Child, StructuralReleaseReason } from '@exactjs/core';
import type { Mounted, Root } from '../types.js';

/** Optional task-frame retention selected only when authored code observes component roots. */
export type RetainedReleaseCapability = Readonly<{
	release(root: Root, parent: Node, mounted: Mounted, reason: StructuralReleaseReason): boolean;
	reverse(root: Root, parent: Node, next: Child): Mounted | undefined;
	dispose(root: Root): void;
}>;

let capability: RetainedReleaseCapability | undefined;

/** Installs component-root release retention for the current DOM runtime. */
export function registerRetainedReleaseCapability(next: RetainedReleaseCapability): void {
	capability ??= next;
}

/** Retains a structurally absent range only when its component root is explicitly observed. */
export function releaseMountedRange(
	root: Root,
	parent: Node,
	mounted: Mounted,
	reason: StructuralReleaseReason
): boolean {
	return capability?.release(root, parent, mounted, reason) ?? false;
}

/** Restores a retained root range when the optional capability owns a matching generation. */
export function takeReversedRelease(root: Root, parent: Node, next: Child): Mounted | undefined {
	return capability?.reverse(root, parent, next);
}

/** Cancels retained root releases when that capability was installed. */
export function disposeRetainedReleases(root: Root): void {
	capability?.dispose(root);
}
