import type { ComponentInstance, VNode } from '@exactjs/core';
import type { EffectScope } from '@exactjs/reactive';
import type { Mounted, Root } from '../types.js';

/** Mount operation supplied by the base renderer without importing enhancement implementation code. */
export type EnhancementMountOperation = (
	vnode: VNode,
	parentInstance: ComponentInstance<any> | undefined,
	parentScope: EffectScope | undefined,
	parentNode: Node | undefined
) => Mounted;

/** Patch operation supplied by the base renderer without importing enhancement implementation code. */
export type EnhancementPatchOperation = (
	mounted: Mounted | undefined,
	vnode: VNode,
	parentInstance: ComponentInstance<any> | undefined,
	parentScope: EffectScope | undefined
) => Mounted;

/** Complete DOM lifecycle implemented when an enhancement-bearing module is reachable. */
export type DomEnhancementCapability = Readonly<{
	abi: 1;
	install(root: Root, mount: EnhancementMountOperation): void;
	/** Constructs a direct intrinsic or fragment wrapper before mounting its descendants. */
	mountDirect?(
		root: Root,
		vnode: VNode,
		parentInstance: ComponentInstance<any> | undefined,
		parentScope: EffectScope | undefined,
		mount: EnhancementMountOperation
	): Mounted | undefined;
	activate(
		root: Root,
		mounted: Mounted,
		parentInstance: ComponentInstance<any> | undefined,
		parentScope: EffectScope | undefined,
		mount: EnhancementMountOperation
	): Mounted;
	patch(
		root: Root,
		mounted: Mounted,
		next: VNode,
		parent: Node,
		parentInstance: ComponentInstance<any> | undefined,
		parentScope: EffectScope | undefined,
		patch: EnhancementPatchOperation
	): Mounted;
}>;

type DomEnhancementCapabilityRegistry = {
	abi: 1;
	capability?: DomEnhancementCapability;
};

const registryKey = Symbol.for('@exactjs/dom.enhancement-capability.v1');

/** Returns the realm-wide registry shared by independently bundled compatible eXact clients. */
function capabilityRegistry(): DomEnhancementCapabilityRegistry {
	const realm = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
	const current = realm[registryKey];
	if (current !== undefined) {
		if (!isCapabilityRegistry(current))
			throw new Error('Incompatible eXact DOM enhancement capability registry in this realm');
		return current;
	}
	const created: DomEnhancementCapabilityRegistry = { abi: 1 };
	realm[registryKey] = created;
	return created;
}

/** Installs enhancement behavior once while accepting equivalent registrations from other bundles. */
export function registerDomEnhancementCapability(capability: DomEnhancementCapability): void {
	if (capability.abi !== 1)
		throw new Error(`Unsupported eXact DOM enhancement capability ABI ${capability.abi}`);
	const registry = capabilityRegistry();
	registry.capability ??= capability;
}

/** Resolves enhancement behavior at the optional VNode boundary, including late registrations. */
export function domEnhancementCapability(): DomEnhancementCapability | undefined {
	return capabilityRegistry().capability;
}

/** Requires the integration only after authored enhancement state makes it semantically necessary. */
export function requireDomEnhancementCapability(): DomEnhancementCapability {
	const capability = domEnhancementCapability();
	if (!capability)
		throw new Error(
			'eXact enhancement declarations require the compiler-selected DOM enhancement integration'
		);
	return capability;
}

function isCapabilityRegistry(value: unknown): value is DomEnhancementCapabilityRegistry {
	return !!value && typeof value === 'object' && (value as { abi?: unknown }).abi === 1;
}
