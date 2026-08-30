import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactTargetReceiptData } from '@exactjs/core/runtime/component-operations';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import { updateProps } from '../props.js';
import type { Mounted, Root } from '../types.js';

/** Optional target-contribution implementation selected by compiled artifacts that emit Target. */
export type TargetDomCapability = Readonly<{
	mount(
		root: Root,
		receipt: ExactTargetReceiptData,
		scope: EffectScope,
		owner: AnyComponentInstance | undefined,
		parentNode: Node | undefined
	): Mounted;
	patch(
		root: Root,
		parent: Node,
		mounted: Mounted,
		receipt: ExactTargetReceiptData,
		owner: AnyComponentInstance | undefined
	): Mounted;
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

const targetDomCapabilityKey = Symbol.for('@exactjs/dom.target-capability.v1');
type TargetCapabilityRegistry = { abi: 1; capability?: TargetDomCapability };
type TargetCapabilityHost = typeof globalThis & {
	[targetDomCapabilityKey]?: TargetCapabilityRegistry;
};

function targetDomCapability(): TargetDomCapability | undefined {
	return targetCapabilityRegistry().capability;
}

/** Requires Target operation handling selected by the compiler for this artifact. */
export function requireTargetDomCapability(): TargetDomCapability {
	const capability = targetDomCapability();
	if (!capability)
		throw new Error(
			'Target rendering is unavailable because this artifact did not include the DOM capability'
		);
	return capability;
}

function targetCapabilityRegistry(): TargetCapabilityRegistry {
	const host = globalThis as TargetCapabilityHost;
	const current = host[targetDomCapabilityKey];
	if (current !== undefined) {
		if (current.abi !== 1) throw new Error('Incompatible eXact target DOM capability registry');
		return current;
	}
	const created: TargetCapabilityRegistry = { abi: 1 };
	host[targetDomCapabilityKey] = created;
	return created;
}

/** Installs target contribution behavior for the current DOM runtime instance. */
export function registerTargetDomCapability(capability: TargetDomCapability): void {
	targetCapabilityRegistry().capability ??= capability;
}

/** Refreshes an emitted Target boundary and fails closed when its capability was not selected. */
export function refreshTargetBoundary(
	root: Root,
	boundary: Mounted,
	owner: AnyComponentInstance | undefined
): void {
	const capability = targetDomCapability();
	if (!capability)
		throw new Error(
			'Target rendering is unavailable because this artifact did not include the DOM capability'
		);
	capability.refreshBoundary(root, boundary, owner);
}

/** Refreshes Target nodes when the optional capability is present. */
export function refreshTargetSubtree(
	root: Root,
	mounted: Mounted,
	owner: AnyComponentInstance | undefined
): void {
	targetDomCapability()?.refreshSubtree(root, mounted, owner);
}

/** Refreshes Target routes affected by a structural change when present. */
export function refreshTargetDependents(root: Root, structuralOwner: Mounted): void {
	targetDomCapability()?.refreshDependents(root, structuralOwner);
}

/** Applies ordinary authored props directly unless Target layers are enabled. */
export function updateTargetedIntrinsicProps(
	root: Root,
	mounted: Mounted,
	previous: Record<string, unknown>,
	next: Record<string, unknown>
): void {
	const capability = targetDomCapability();
	if (capability) capability.updateIntrinsic(root, mounted, previous, next);
	else if (mounted.dom instanceof Element)
		updateProps(root, mounted.dom, previous, next, mounted.scope);
}

/** Releases optional Target-owned intrinsic resources. */
export function clearTargetedIntrinsicProps(mounted: Mounted): void {
	targetDomCapability()?.clearIntrinsic(mounted);
}
