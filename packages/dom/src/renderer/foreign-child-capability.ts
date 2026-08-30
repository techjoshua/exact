import type { AnyComponentInstance, Child, ComponentDomain } from '@exactjs/core';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';

/** Explicit renderer integration for foreign or test-owned child representations. */
export type ForeignChildCapability = Readonly<{
	abi: 1;
	mount(
		root: Root,
		value: Child,
		parentInstance: AnyComponentInstance | undefined,
		parentScope: EffectScope | undefined,
		parentNode: Node | undefined
	): Mounted | undefined;
	patch(
		root: Root,
		parent: Node,
		mounted: Mounted | undefined,
		value: Child,
		parentInstance: AnyComponentInstance | undefined,
		parentScope: EffectScope | undefined
	): Mounted;
	adopt(
		root: Root,
		value: Child,
		nodes: readonly Node[],
		cursor: number,
		parentInstance: AnyComponentInstance | undefined,
		parentScope: EffectScope,
		end: number
	): { mounted: Mounted; next: number } | undefined;
	key(value: Child): string | undefined;
	domain(value: Child): ComponentDomain | undefined;
	withDomain(value: Child, domain: ComponentDomain): Child;
	canPatch(mounted: Mounted, value: Child): boolean;
	/** Reports whether a compatibility-owned mount owns the DOM ranges of its children. */
	ownsChildDom?(mounted: Mounted): boolean;
	/** Decodes an explicitly supported foreign unsafe-HTML operation for iframe srcdoc. */
	unsafeHtmlValue?(value: Child): Readonly<{ value: unknown }> | undefined;
	prepareProgramChildren?(values: Child[]): Child[];
	reconcile?(
		root: Root,
		parent: Node,
		mounted: Mounted[],
		values: Child[],
		parentInstance: AnyComponentInstance | undefined,
		parentScope: EffectScope | undefined,
		before: Node | null | undefined,
		structuralOwner: Mounted | undefined
	): Mounted[];
}>;

type Registry = { abi: 1; capability?: ForeignChildCapability };
const registryKey = Symbol.for('@exactjs/dom.foreign-child-capability.v1');

function registry(): Registry {
	const realm = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
	const current = realm[registryKey];
	if (current !== undefined) {
		if (!current || typeof current !== 'object' || (current as { abi?: unknown }).abi !== 1)
			throw new Error('Incompatible eXact DOM foreign-child capability registry');
		return current as Registry;
	}
	const created: Registry = { abi: 1 };
	realm[registryKey] = created;
	return created;
}

/** Registers an explicit compatibility or testing child interpreter. */
export function registerForeignChildCapability(capability: ForeignChildCapability): void {
	if (capability.abi !== 1) throw new Error('Unsupported eXact DOM foreign-child capability ABI');
	registry().capability ??= capability;
}

/** Returns the optional foreign child interpreter without making it part of native execution. */
export function foreignChildCapability(): ForeignChildCapability | undefined {
	return registry().capability;
}

/** Lets an explicitly installed foreign interpreter prepare its own render-program values. */
export function prepareForeignProgramChildren(values: Child[]): Child[] {
	return foreignChildCapability()?.prepareProgramChildren?.(values) ?? values;
}

/** Requires explicit integration after an unrecognized non-scalar child crosses the boundary. */
export function requireForeignChildCapability(): ForeignChildCapability {
	const capability = foreignChildCapability();
	if (!capability)
		throw new TypeError(
			'This child representation requires an explicit eXact DOM compatibility integration'
		);
	return capability;
}
