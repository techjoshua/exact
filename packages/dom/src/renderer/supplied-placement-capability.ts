import { componentContractVersion } from '../component-contract-version.js';
import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { Mounted, Root } from '../types.js';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type * as Placement from './supplied-placement.js';

type PlacementCapability = Readonly<{
	retain: typeof Placement.retainSuppliedPlacement;
	validate: typeof Placement.validateSuppliedPlacement;
	take: typeof Placement.takeSuppliedPlacement;
	finish: typeof Placement.finishSuppliedPlacementPlan;
	inputs: typeof Placement.withSuppliedPlacementInputs;
}>;
const capabilityKey = Symbol.for(
	`@exactjs/dom.supplied-placement-capability.v2/component/${componentContractVersion}`
);
type Host = typeof globalThis & { [capabilityKey]?: PlacementCapability };

/** Installs placement validation from either an enhancement provider or a Target artifact. */
export function registerSuppliedPlacementCapability(capability: PlacementCapability): void {
	(globalThis as Host)[capabilityKey] ??= capability;
}

/** Ordinary receivers retain no placement machinery; providers select it independently. */
export function retainSuppliedPlacement(
	mounted: Mounted,
	output: readonly Child[],
	root: Root
): void {
	if (
		!mounted.componentReceipt?.transparentUpdateOwner &&
		!mounted.clientArtifact?.capabilities.includes('targets')
	)
		return;
	const capability = (globalThis as Host)[capabilityKey];
	if (!capability) throw new Error('Supplied placement requires the compiler-selected capability');
	capability.retain(mounted, output, root);
}

/** Invalidates a supplied placement only when the loaded provider selected that capability. */
export function validateSuppliedPlacement(
	owner: AnyComponentInstance | undefined,
	root: Root
): void {
	(globalThis as Host)[capabilityKey]?.validate(owner, root);
}

/** Transfers a parked supplied child without importing placement ownership into plain renderers. */
export function takeSuppliedPlacement(
	root: Root,
	value: Child,
	owner: AnyComponentInstance | undefined,
	scope: EffectScope | undefined,
	parent: Node | undefined
): Mounted | undefined {
	return (globalThis as Host)[capabilityKey]?.take(root, value, owner, scope, parent);
}

/** Validates and commits only an existing pending supplied-placement frame. */
export function finishSuppliedPlacementPlan(root: Root): void {
	if (root.suppliedPlacementPlan) (globalThis as Host)[capabilityKey]?.finish(root);
}

/** Keeps ordinary input receipt within its existing affected supplied-placement work boundary. */
export function withSuppliedPlacementInputs<T>(
	owner: AnyComponentInstance | undefined,
	receive: () => T
): T {
	const capability = (globalThis as Host)[capabilityKey];
	return capability ? capability.inputs(owner, receive) : receive();
}
