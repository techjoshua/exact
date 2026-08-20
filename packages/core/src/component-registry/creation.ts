import type { AnyAuthoredComponentFunction, AnyComponentFunction } from '../component/contracts.js';
import { markExactComponent } from '../component-contracts.js';
import { createVNode } from '../vnode.js';
import type {
	ComponentRegistry,
	ComponentRegistryBuilder,
	ComponentRegistryDefinition,
	ComponentRegistryEntryRuntime,
	ComponentRegistryInspection,
	ComponentRegistryRuntime,
	ComponentSelection,
	LazyRegistryEntry,
	RegistryFacadeInstance
} from './contracts.js';
import {
	assertSafeRegistryKey,
	invalidRegistryEntry,
	unsafeComponentRegistryKeys
} from './errors.js';
import { loadRegistryEntry, registerRegistryFacade, registryEntryFor } from './loading.js';

const lazyDescriptor = Symbol('exact.lazy-registry-entry');
const registryValues = new WeakMap<object, ComponentRegistryRuntime>();

type RuntimeLazyEntry = {
	readonly [lazyDescriptor]: true;
	readonly load: () => Promise<AnyAuthoredComponentFunction>;
};

/**
 * Creates an immutable finite component registry from one declarative definition callback.
 *
 * The callback executes once. Its scoped `lazy()` function becomes invalid immediately after the
 * callback returns, and the returned definition is copied into a frozen null-prototype record.
 */
export function createComponentRegistry<const Definition extends ComponentRegistryDefinition>(
	define: (builder: ComponentRegistryBuilder) => Definition
): ComponentRegistry<Definition> {
	return createRegistry(undefined, undefined, define);
}

/**
 * Creates a registry with compiler-derived identity.
 *
 * This is a generated-code primitive. Application source should call
 * {@link createComponentRegistry}; authored names never become protocol operation IDs.
 */
export function createCompiledComponentRegistry<
	const Definition extends ComponentRegistryDefinition
>(
	id: string,
	name: string,
	define: (builder: ComponentRegistryBuilder) => Definition
): ComponentRegistry<Definition> {
	if (!id || !name)
		throw new TypeError('Compiled component registries require non-empty identity metadata');
	return createRegistry(id, name, define);
}

function createRegistry<const Definition extends ComponentRegistryDefinition>(
	id: string | undefined,
	name: string | undefined,
	define: (builder: ComponentRegistryBuilder) => Definition
): ComponentRegistry<Definition> {
	if (typeof define !== 'function')
		throw new TypeError('createComponentRegistry() requires a definition callback');
	let defining = true;
	const builder: ComponentRegistryBuilder = {
		lazy<Component extends AnyAuthoredComponentFunction>(
			load: () => Promise<Component>
		): LazyRegistryEntry<Component> {
			if (!defining)
				throw new Error('Registry lazy() may be called only during its definition callback');
			if (typeof load !== 'function') throw new TypeError('Registry lazy() requires a loader');
			return Object.freeze({
				[lazyDescriptor]: true,
				load
			}) as unknown as LazyRegistryEntry<Component>;
		}
	};

	let definition: Definition;
	try {
		definition = define(builder);
	} finally {
		defining = false;
	}
	if (!definition || typeof definition !== 'object' || Array.isArray(definition))
		throw new TypeError('A component registry definition must return a finite object');
	const prototype = Object.getPrototypeOf(definition);
	if (prototype !== Object.prototype && prototype !== null)
		throw new TypeError('A component registry definition must use a plain object');
	const keys = Object.keys(definition);
	if (!keys.length) throw new TypeError('A component registry requires at least one entry');

	const value = Object.create(null) as Record<PropertyKey, unknown>;
	const entries = new Map<string, ComponentRegistryEntryRuntime>();
	const runtime: ComponentRegistryRuntime = { id, name, entries };
	for (const key of keys) {
		assertSafeRegistryKey(key);
		const authored = definition[key];
		const lazy = isRuntimeLazyEntry(authored) ? authored : undefined;
		if (!lazy && typeof authored !== 'function')
			throw invalidRegistryEntry(key, 'expected a component or the scoped lazy() result');
		const facade = function RegistryEntryFacade(
			this: RegistryFacadeInstance,
			props: Record<string, unknown>
		) {
			return () => {
				const component = entry.resolved ?? entry.eager;
				if (!component) throw loadRegistryEntry(entry);
				// Registry keys are selection identity even when two entries
				// intentionally resolve to the same underlying component.
				return createVNode(component, {
					...props,
					key: `exact-registry:${entry.key}`
				});
			};
		} as AnyComponentFunction;
		Object.defineProperty(facade, 'name', {
			configurable: true,
			value: `${name ?? 'ComponentRegistry'}.${key}${id ? `#${id}` : ''}`
		});
		if (id) markExactComponent(facade, `${id}:${key}`);
		const entry: ComponentRegistryEntryRuntime = {
			registry: runtime,
			key,
			facade,
			eager: lazy ? undefined : (authored as AnyComponentFunction),
			load: lazy?.load as (() => Promise<AnyComponentFunction>) | undefined,
			loadGeneration: 0
		};
		if (entry.eager) entry.resolved = entry.eager;
		entries.set(key, entry);
		registerRegistryFacade(entry);
		Object.defineProperty(value, key, {
			enumerable: true,
			value: facade
		});
	}
	Object.freeze(value);
	registryValues.set(value, runtime);
	return value as ComponentRegistry<Definition>;
}

/** Returns a frozen diagnostic snapshot without exposing loaders or component functions. */
export function inspectComponentRegistry(
	registry: ComponentRegistry<any>
): ComponentRegistryInspection {
	const runtime = registryValues.get(registry as object);
	if (!runtime) throw new TypeError('inspectComponentRegistry() requires a component registry');
	return Object.freeze({
		...(runtime.id ? { id: runtime.id } : {}),
		...(runtime.name ? { name: runtime.name } : {}),
		entries: Object.freeze(
			[...runtime.entries.values()].map((entry) =>
				Object.freeze({
					key: entry.key,
					mode: entry.load ? ('lazy' as const) : ('eager' as const),
					status: entry.resolved
						? ('ready' as const)
						: entry.pending
							? ('loading' as const)
							: entry.error
								? ('failed' as const)
								: ('idle' as const),
					generation: entry.loadGeneration
				})
			)
		)
	});
}

/** Narrows an untrusted string to the finite keys owned by a branded registry. */
export function hasComponent<Registry extends ComponentRegistry<any>>(
	registry: Registry,
	value: string
): value is Extract<keyof Registry, string> {
	return (
		registryValues.has(registry as object) &&
		!unsafeComponentRegistryKeys.has(value) &&
		Object.prototype.hasOwnProperty.call(registry, value)
	);
}

/**
 * Preloads a lazy registry facade without constructing a component instance.
 *
 * Eager components and ordinary component functions resolve immediately.
 */
export async function preloadComponent(component: AnyAuthoredComponentFunction): Promise<void> {
	if (typeof component !== 'function')
		throw new TypeError('preloadComponent() requires a component');
	const entry = registryEntryFor(component as AnyComponentFunction);
	if (!entry) return;
	await loadRegistryEntry(entry);
}

/** Renders one correlated heterogeneous registry selection as an ordinary component vnode. */
export function renderComponent<Registry extends ComponentRegistry<any>>(
	registry: Registry,
	selection: ComponentSelection<Registry>
) {
	if (!registryValues.has(registry as object))
		throw new TypeError('renderComponent() requires a component registry');
	const selected = selection as { component: string; props: Record<string, unknown> };
	if (!hasComponent(registry, selected.component))
		throw invalidRegistryEntry(selected.component, 'key is not present in this registry');
	return createVNode(registry[selected.component] as AnyComponentFunction, selected.props);
}

function isRuntimeLazyEntry(value: unknown): value is RuntimeLazyEntry {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as Partial<RuntimeLazyEntry>)[lazyDescriptor] === true
	);
}
