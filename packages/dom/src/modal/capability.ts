import type { StopHandle } from '@exactjs/core';
import type { EffectScope } from '@exactjs/reactive';

/** Optional native-dialog binding installed only when compiled modal bindings are reachable. */
export type ModalBindingCapability = Readonly<{
	bind(
		element: Element,
		source: unknown,
		scope: EffectScope,
		onRelease: () => void
	): StopHandle | undefined;
}>;

let modalBindingCapability: ModalBindingCapability | undefined;

/** Installs modal binding support for the current DOM runtime instance. */
export function registerModalBindingCapability(capability: ModalBindingCapability): void {
	if (modalBindingCapability && modalBindingCapability !== capability)
		throw new Error('Conflicting eXact modal binding capability integration');
	modalBindingCapability = capability;
}

/** Returns modal binding support when this artifact contains it. */
export function getModalBindingCapability(): ModalBindingCapability | undefined {
	return modalBindingCapability;
}
