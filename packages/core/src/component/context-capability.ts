import type { Reactive } from '@exactjs/reactive/framework/runtime';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ComponentResumptionSource,
	ContextToken
} from './contracts.js';

/** Optional context implementation selected by compiler-emitted component capability imports. */
export type ComponentContextCapability = Readonly<{
	has(
		instance: AnyComponentInstance,
		ambient: ComponentContextValues | undefined,
		token: ContextToken<unknown>
	): boolean;
	get<T>(
		instance: AnyComponentInstance,
		ambient: ComponentContextValues | undefined,
		token: ContextToken<T>
	): Reactive<T>;
	set<T>(instance: AnyComponentInstance, token: ContextToken<T>, value: T): void;
	publish(
		instance: AnyComponentInstance,
		token: ContextToken<unknown>,
		operation: 'read' | 'write'
	): void;
	prepare(instance: AnyComponentInstance, resumption: ComponentResumptionSource): void;
}>;

let contextCapability: ComponentContextCapability | undefined;

/** Installs the context implementation for a bundle containing compiled context operations. */
export function registerComponentContextCapability(capability: ComponentContextCapability): void {
	if (contextCapability && contextCapability !== capability)
		throw new Error('Conflicting eXact component context capability integration');
	contextCapability = capability;
}

/** Reads the compiler-selected context implementation and fails closed when it is absent. */
export function componentContextCapability(): ComponentContextCapability {
	if (!contextCapability)
		throw new Error(
			'Component contexts are unavailable because this artifact did not include the context capability'
		);
	return contextCapability;
}

/** Reads the optional context implementation without making it universally reachable. */
export function optionalComponentContextCapability(): ComponentContextCapability | undefined {
	return contextCapability;
}
