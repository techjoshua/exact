import type { ReactiveValue } from '@exactjs/reactive/framework/runtime';
import type { VNode } from './contracts.js';

/** Runtime bridge for optional compiler-owned keyed list controllers. */
export type ComponentListCapability = Readonly<{
	map<T>(
		owner: object,
		collection: Iterable<T> | ReactiveValue<Iterable<T>>,
		key: (item: T) => string,
		render: (item: T) => VNode,
		id?: string,
		provenance?: Iterable<T>,
		keyIdentity?: string
	): VNode;
	begin(owner: object): void;
	end(owner: object): void;
	dispose(owner: object): void;
}>;

let capability: ComponentListCapability | undefined;

/** Installs keyed-list support when the compiled artifact contains component list ownership. */
export function registerComponentListCapability(next: ComponentListCapability): void {
	if (capability && capability !== next)
		throw new Error('Conflicting eXact component list capability integration');
	capability = next;
}

/** Returns the reachable list implementation or fails when compiler capability emission is stale. */
export function componentListCapability(): ComponentListCapability {
	if (!capability)
		throw new Error(
			'Component lists require the compiler-selected @exactjs/core/runtime/lists capability'
		);
	return capability;
}

/** Returns keyed-list support only when this artifact registered it. */
export function optionalComponentListCapability(): ComponentListCapability | undefined {
	return capability;
}
