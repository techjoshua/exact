import type {
	AnyComponent,
	AnyComponentInstance,
	AnyContextToken,
	ComponentContinuationContextBinding,
	ComponentResumptionActivation
} from './contracts.js';

const bindingsByInstance = new WeakMap<AnyComponentInstance, Map<string, AnyContextToken>>();
const resumptionsByInstance = new WeakMap<AnyComponentInstance, ComponentResumptionActivation>();
const appliedByInstance = new WeakMap<AnyComponentInstance, Set<string>>();

/**
 * Makes one validated SSR activation available while compiler-generated setup
 * registers the client-local token identities needed to apply its context values.
 */
export function prepareComponentContextResumption(
	instance: AnyComponentInstance,
	resumption: ComponentResumptionActivation
): void {
	resumptionsByInstance.set(instance, resumption);
}

/**
 * Registers compiler-approved context token identities without transporting the
 * token objects. Any matching SSR value is installed before descendants render.
 */
export function registerComponentContinuationContexts(
	component: AnyComponent,
	bindings: readonly ComponentContinuationContextBinding[]
): void {
	const instance = component as AnyComponentInstance;
	let registered = bindingsByInstance.get(instance);
	if (!registered) {
		registered = new Map();
		bindingsByInstance.set(instance, registered);
	}
	let applied = appliedByInstance.get(instance);
	if (!applied) {
		applied = new Set();
		appliedByInstance.set(instance, applied);
	}
	const resumption = resumptionsByInstance.get(instance);
	for (const binding of bindings) {
		if (!safeContextName(binding.name) || typeof binding.token?.id !== 'symbol') {
			throw new Error('Malformed eXact continuation context binding');
		}
		const previous = registered.get(binding.name);
		if (previous && previous.id !== binding.token.id) {
			throw new Error(`Conflicting eXact continuation context binding ${binding.name}`);
		}
		registered.set(binding.name, binding.token);
		if (
			resumption &&
			!applied.has(binding.name) &&
			Object.prototype.hasOwnProperty.call(resumption.contexts, binding.name)
		) {
			instance.setContext(binding.token, resumption.contexts[binding.name]);
			applied.add(binding.name);
		}
	}
}

/**
 * Projects only named, compiler-registered component contexts for an SSR
 * resumption record. Missing values remain absent rather than becoming authority.
 */
export function componentContinuationContextValues(
	instance: AnyComponentInstance,
	names: readonly string[]
): Record<string, unknown> {
	const registered = bindingsByInstance.get(instance);
	const values: Record<string, unknown> = {};
	for (const name of names) {
		const token = registered?.get(name);
		if (!token) {
			throw new Error(`Missing eXact continuation context binding ${name}`);
		}
		if (!instance.contexts.has(token.id)) continue;
		const value = instance.contexts.get(token.id);
		if (value !== undefined) values[name] = value;
	}
	return values;
}

/** Rejects property names that could alter an ordinary JSON object's prototype. */
function safeContextName(name: string): boolean {
	return name.length > 0 && name !== '__proto__' && name !== 'prototype' && name !== 'constructor';
}
