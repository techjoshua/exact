import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type {
	ExactActivityReceiptData,
	ExactSuspenseReceiptData
} from '@exactjs/core/runtime/component-operations';
import type { Mounted, Root } from '../types.js';

/** Adopts one compiler-owned structural child range without rebuilding matched DOM. */
export type AdoptStructuralChildren = (
	root: Root,
	children: Child[],
	nodes: readonly Node[],
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	start?: number,
	end?: number
) => Mounted[] | undefined;

/** Optional native Activity and Suspense renderer selected as one coordinated structural unit. */
export type StructuralBoundaryCapability = Readonly<{
	mountActivityReceipt(
		root: Root,
		receipt: ExactActivityReceiptData,
		scope: EffectScope,
		parentInstance: AnyComponentInstance | undefined,
		parentNode: Node | undefined
	): Mounted;
	mountSuspenseReceipt(
		root: Root,
		receipt: ExactSuspenseReceiptData,
		scope: EffectScope,
		parentInstance: AnyComponentInstance | undefined,
		parentNode: Node | undefined
	): Mounted;
	patchActivityReceipt(
		root: Root,
		parent: Node,
		mounted: Mounted,
		next: ExactActivityReceiptData
	): Mounted;
	patchSuspenseReceipt(
		root: Root,
		parent: Node,
		mounted: Mounted,
		next: ExactSuspenseReceiptData,
		parentInstance: AnyComponentInstance | undefined
	): Mounted;
	adoptActivityReceipt(
		root: Root,
		receipt: ExactActivityReceiptData,
		nodes: readonly Node[],
		cursor: number,
		parentInstance: AnyComponentInstance | undefined,
		parentScope: EffectScope,
		end: number,
		adoptChildren: AdoptStructuralChildren
	): { mounted: Mounted; next: number } | undefined;
	adoptSuspenseReceipt(
		root: Root,
		receipt: ExactSuspenseReceiptData,
		nodes: readonly Node[],
		cursor: number,
		parentInstance: AnyComponentInstance | undefined,
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
