import type { RefBinding, RefKey, RefRegistry } from './contracts.js';

/** Runtime bridge for the optional component ref authoring surface. */
export type ComponentRefCapability = Readonly<{
	registry(owner: object): RefRegistry;
	ref<T>(owner: object, key: RefKey<T>): RefBinding<T>;
	read<T>(owner: object, key: RefKey<T>): T | undefined;
}>;

let capability: ComponentRefCapability | undefined;

/** Installs ref support when a compiled artifact or the public core facade requests it. */
export function registerComponentRefCapability(next: ComponentRefCapability): void {
	if (capability && capability !== next)
		throw new Error('Conflicting eXact component ref capability integration');
	capability = next;
}

/** Returns the reachable ref implementation or fails when compiler capability emission is stale. */
export function componentRefCapability(): ComponentRefCapability {
	if (!capability)
		throw new Error(
			'Component refs require the compiler-selected @exactjs/core/runtime/refs capability'
		);
	return capability;
}
