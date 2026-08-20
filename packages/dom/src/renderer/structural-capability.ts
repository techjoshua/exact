import type { AnyComponentInstance, Child, VNode } from '@exactjs/core';
import type { EffectScope } from '@exactjs/reactive';
import type { Mounted, Root } from '../types.js';

/** Adopts one compiler-owned structural child range without rebuilding matched DOM. */
export type AdoptStructuralChildren = (
	root: Root,
	children: Child[],
	nodes: readonly Node[],
	parentInstance: AnyComponentInstance,
	parentScope: EffectScope,
	start?: number,
	end?: number
) => Mounted[] | undefined;

/** Optional native Activity and Suspense renderer selected as one coordinated structural unit. */
export type StructuralBoundaryCapability = Readonly<{
	mountActivity(
		root: Root,
		vnode: VNode,
		scope: EffectScope,
		parentInstance: AnyComponentInstance | undefined,
		parentNode: Node | undefined
	): Mounted;
	mountSuspense(
		root: Root,
		vnode: VNode,
		scope: EffectScope,
		parentInstance: AnyComponentInstance | undefined,
		parentNode: Node | undefined
	): Mounted;
	patchActivity(root: Root, parent: Node, mounted: Mounted, next: VNode): Mounted;
	patchSuspense(
		root: Root,
		parent: Node,
		mounted: Mounted,
		next: VNode,
		parentInstance: AnyComponentInstance | undefined
	): Mounted;
	adoptActivity(
		root: Root,
		vnode: VNode,
		nodes: readonly Node[],
		cursor: number,
		parentInstance: AnyComponentInstance,
		parentScope: EffectScope,
		end: number,
		adoptChildren: AdoptStructuralChildren
	): { mounted: Mounted; next: number } | undefined;
	adoptSuspense(
		root: Root,
		vnode: VNode,
		nodes: readonly Node[],
		cursor: number,
		parentInstance: AnyComponentInstance,
		parentScope: EffectScope,
		end: number,
		adoptChildren: AdoptStructuralChildren
	): { mounted: Mounted; next: number } | undefined;
}>;

let structuralBoundaryCapability: StructuralBoundaryCapability | undefined;

/** Installs native structural-boundary rendering for the current DOM runtime instance. */
export function registerStructuralBoundaryCapability(
	capability: StructuralBoundaryCapability
): void {
	if (structuralBoundaryCapability && structuralBoundaryCapability !== capability)
		throw new Error('Conflicting eXact structural boundary capability integration');
	structuralBoundaryCapability = capability;
}

/** Requires native structural-boundary rendering selected for this artifact. */
export function requireStructuralBoundaryCapability(): StructuralBoundaryCapability {
	if (!structuralBoundaryCapability)
		throw new Error(
			'Activity or Suspense rendering is unavailable because this artifact did not include the structural boundary capability'
		);
	return structuralBoundaryCapability;
}
