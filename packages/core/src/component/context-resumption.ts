import type {
	AnyComponent,
	AnyComponentInstance,
	AnyContextToken,
	ComponentContinuationContextBinding,
	ComponentResumptionSource
} from './contracts.js';

type IndexedContextField = readonly [field: string, value: unknown];

const bindingsByInstance = new WeakMap<AnyComponentInstance, Map<string, AnyContextToken>>();
const resumptionsByInstance = new WeakMap<AnyComponentInstance, ComponentResumptionSource>();
const appliedByInstance = new WeakMap<AnyComponentInstance, Set<string>>();

/**
 * Makes one validated SSR activation available while compiler-generated setup
 * registers the client-local token identities needed to apply its context values.
 */
export function prepareComponentContextResumption(
	instance: AnyComponentInstance,
	resumption: ComponentResumptionSource
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
	const resumedContexts = resumption
		? 'componentId' in resumption
			? resumption.contexts
			: (resumption[2] ?? [])
		: undefined;
	for (const binding of bindings) {
		if (!safeContextName(binding.name) || typeof binding.token?.id !== 'symbol') {
			throw new Error('Malformed eXact continuation context binding');
		}
		const previous = registered.get(binding.name);
		if (previous && previous.id !== binding.token.id) {
			throw new Error(`Conflicting eXact continuation context binding ${binding.name}`);
		}
		registered.set(binding.name, binding.token);
		if (!resumedContexts || applied.has(binding.name)) continue;
		let found = false;
		let resumed: unknown;
		if (Array.isArray(resumedContexts)) {
			for (const [field, value] of resumedContexts as unknown as readonly IndexedContextField[])
				if (field === binding.name) {
					found = true;
					resumed = value;
					break;
				}
		} else if (Object.prototype.hasOwnProperty.call(resumedContexts, binding.name)) {
			found = true;
			resumed = (resumedContexts as Readonly<Record<string, unknown>>)[binding.name];
		}
		if (found) {
			instance.setContext(binding.token, resumed);
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
