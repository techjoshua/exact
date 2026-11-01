import { sharedTaskRuntimeState } from './runtime-state.js';
const owners = sharedTaskRuntimeState(
	'resource-owner-signals',
	() => new WeakMap<AbortSignal, WeakRef<AbortSignal>>()
);

/** Resolves the generation that supplied resource cancellation without retaining a settled owner. */
export function taskResourceOwnerSignal(signal: AbortSignal): AbortSignal {
	return owners.get(signal)?.deref() ?? signal;
}

/** Carries generation identity through lifetime and cancellation adapters while preserving signal identity. */
export function linkTaskResourceOwnerSignal(signal: AbortSignal, owner: AbortSignal): AbortSignal {
	const original = taskResourceOwnerSignal(owner);
	if (signal !== original) owners.set(signal, new WeakRef(original));
	return signal;
}
