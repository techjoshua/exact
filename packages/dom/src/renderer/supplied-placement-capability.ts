import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { Mounted, Root } from '../types.js';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type * as Placement from './supplied-placement.js';

type PlacementCapability = Readonly<{
	retain: typeof Placement.retainSuppliedPlacement;
	validate: typeof Placement.validateSuppliedPlacement;
	take: typeof Placement.takeSuppliedPlacement;
}>;
const capabilityKey = Symbol.for('@exactjs/dom.supplied-placement-capability.v2');
type Host = typeof globalThis & { [capabilityKey]?: PlacementCapability };

/** Installs placement validation from either an enhancement provider or a Target artifact. */
export function registerSuppliedPlacementCapability(capability: PlacementCapability): void {
	(globalThis as Host)[capabilityKey] ??= capability;
}

/** Ordinary receivers retain no placement machinery; providers select it independently. */
export function retainSuppliedPlacement(mounted: Mounted, output: readonly Child[]): void {
	if (
		!mounted.componentReceipt?.transparentUpdateOwner &&
		!mounted.clientArtifact?.capabilities.includes('targets')
	)
		return;
	const capability = (globalThis as Host)[capabilityKey];
	if (!capability) throw new Error('Supplied placement requires the compiler-selected capability');
	capability.retain(mounted, output);
}

/** Invalidates a supplied placement only when the loaded provider selected that capability. */
export function validateSuppliedPlacement(owner: AnyComponentInstance | undefined): void {
	(globalThis as Host)[capabilityKey]?.validate(owner);
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
