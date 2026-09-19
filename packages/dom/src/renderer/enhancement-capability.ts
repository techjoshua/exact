import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { PreparedTextResolver } from '@exactjs/core/framework/render-structure';
import type { ExactComponentReceiptData } from '@exactjs/core/runtime/component-operations';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';

/** Mount operation supplied by the base renderer without importing enhancement implementation code. */
export type EnhancementMountOperation = (
	value: Child,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined,
	parentNode: Node | undefined
) => Mounted;

/** Patch operation supplied by the base renderer without importing enhancement implementation code. */
export type EnhancementPatchOperation = (
	mounted: Mounted | undefined,
	value: Child,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined
) => Mounted;

/** Prepares an owned native text component before projecting its captured output. */
export type TextComponentVisitor = (
	receipt: ExactComponentReceiptData,
	visit: (output: readonly Child[], mounted: Mounted) => string
) => string;

/** Complete DOM lifecycle implemented when an enhancement-bearing module is reachable. */
export type DomEnhancementCapability = Readonly<{
	abi: 2;
	/** Reports whether this compiler-selected capability owns the authored operation. */
	has(value: Child): boolean;
	/** Creates lazy enhancement projection state for a shared Text presentation. */
	createTextProjection?(root: Root, component: TextComponentVisitor): PreparedTextResolver;
	/** Selects incoming namespaces before adopting their component's captured output. */
	adoptComponent?(
		root: Root,
		mounted: Mounted,
		children: Child[],
		adopt: (children: Child[]) => Mounted[] | undefined
	): Mounted[] | undefined;
	/** Projects contributed fragment placements within a structural enhancement owner. */
	projectComponent?(mounted: Mounted, children: Child[]): Child[];
	/** Invalidates retained selections after one owned structural range changes. */
	invalidate?(owner: Mounted): void;
	install(root: Root, mount: EnhancementMountOperation): void;
	/** Adopts a prepared direct fragment chain using the ordinary receipt adoption cursor. */
	adopt?(
		root: Root,
		value: Child,
		nodes: readonly Node[],
		cursor: number,
		parent: AnyComponentInstance | undefined,
		scope: EffectScope,
		end: number
	): { mounted: Mounted; next: number } | undefined;
	/** Constructs a direct intrinsic or fragment wrapper before mounting its descendants. */
	mountDirect?(
		root: Root,
		value: Child,
		parentInstance: AnyComponentInstance | undefined,
		parentScope: EffectScope | undefined,
		mount: EnhancementMountOperation
	): Mounted | undefined;
	activate(
		root: Root,
		mounted: Mounted,
		parentInstance: AnyComponentInstance | undefined,
		parentScope: EffectScope | undefined,
		mount: EnhancementMountOperation
	): Mounted;
	patch(
		root: Root,
		mounted: Mounted,
		next: Child,
		parent: Node,
		parentInstance: AnyComponentInstance | undefined,
		parentScope: EffectScope | undefined,
		patch: EnhancementPatchOperation
	): Mounted;
}>;

type DomEnhancementCapabilityRegistry = {
	abi: 2;
	capability?: DomEnhancementCapability;
};

const registryKey = Symbol.for('@exactjs/dom.enhancement-capability.v2');

/** Returns the realm-wide registry shared by independently bundled compatible eXact clients. */
function capabilityRegistry(): DomEnhancementCapabilityRegistry {
	const realm = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
	const current = realm[registryKey];
	if (current !== undefined) {
		if (!isCapabilityRegistry(current))
			throw new Error('Incompatible eXact DOM enhancement capability registry in this realm');
		return current;
	}
	const created: DomEnhancementCapabilityRegistry = { abi: 2 };
	realm[registryKey] = created;
	return created;
}

/** Installs enhancement behavior once while accepting equivalent registrations from other bundles. */
export function registerDomEnhancementCapability(capability: DomEnhancementCapability): void {
	if (capability.abi !== 2)
		throw new Error(`Unsupported eXact DOM enhancement capability ABI ${capability.abi}`);
	const registry = capabilityRegistry();
	registry.capability ??= capability;
}

/** Resolves enhancement behavior at the explicit compatibility boundary, including late registrations. */
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
	return !!value && typeof value === 'object' && (value as { abi?: unknown }).abi === 2;
}
