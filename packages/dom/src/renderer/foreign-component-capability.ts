import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactClientComponentArtifact } from '@exactjs/core/runtime/component-operations';
import type { Mounted, Root } from '../types.js';

/** Renderer-owner implementation for one fixed foreign compatibility component artifact. */
export type ForeignComponentCapability = Readonly<{
	abi: 1;
	/** Stable renderer identity used to accept equivalent registrations from split bundles. */
	owner: string;
	attach(
		root: Root,
		mounted: Mounted,
		artifact: ExactClientComponentArtifact,
		instance: AnyComponentInstance,
		parentNode: Node | undefined
	): void;
	hydrate(
		root: Root,
		mounted: Mounted,
		artifact: ExactClientComponentArtifact,
		instance: AnyComponentInstance
	): boolean;
}>;

type Registry = { abi: 1; capability?: ForeignComponentCapability };
const registryKey = Symbol.for('@exactjs/dom.foreign-component-capability.v1');

function registry(): Registry {
	const realm = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
	const current = realm[registryKey];
	if (current !== undefined) {
		if (!current || typeof current !== 'object' || (current as { abi?: unknown }).abi !== 1)
			throw new Error('Incompatible eXact DOM foreign component registry');
		return current as Registry;
	}
	const created: Registry = { abi: 1 };
	realm[registryKey] = created;
	return created;
}

/** Installs the renderer that owns an explicitly selected foreign component artifact. */
export function registerForeignComponentCapability(capability: ForeignComponentCapability): void {
	if (capability.abi !== 1) throw new Error('Unsupported foreign component capability ABI');
	const current = registry().capability;
	if (current && current.owner !== capability.owner)
		throw new Error('Conflicting eXact foreign component integration');
	registry().capability ??= capability;
}

/** Resolves the renderer selected by an explicit foreign component artifact. */
export function requireForeignComponentCapability(): ForeignComponentCapability {
	const capability = registry().capability;
	if (!capability)
		throw new Error('A foreign component artifact was used without its renderer integration');
	return capability;
}
