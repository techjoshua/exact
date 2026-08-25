import type { AnyAuthoredComponentFunction, AnyComponentFunction } from '../component/contracts.js';
import { compiledComponentRenderABI } from '../component/compiled-abi.js';
import { createCompiledDynamicComponent } from '../dynamic-component/runtime.js';
import {
	exactComponentContract,
	exactComponentType,
	type ExactComponentContract
} from '../component-contracts.js';
import { createVNode } from '../vnode.js';
import type {
	AnyComponentRegistry,
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
	_define: (builder: ComponentRegistryBuilder) => Definition
): ComponentRegistry<Definition> {
	throw new Error(
		'createComponentRegistry() is source syntax and must be compiled before execution'
	);
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
	target: 'client' | 'server',
	define: (builder: ComponentRegistryBuilder) => Definition
): ComponentRegistry<Definition> {
	if (!id || !name)
		throw new TypeError('Compiled component registries require non-empty identity metadata');
	if (target !== 'client' && target !== 'server')
		throw new TypeError('Compiled component registries require a target-local artifact target');
	return createRegistry(id, name, define, target);
}

function createRegistry<const Definition extends ComponentRegistryDefinition>(
	id: string,
	name: string,
	define: (builder: ComponentRegistryBuilder) => Definition,
	target: 'client' | 'server'
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
			const renderSelection = () => {
				const component = entry.resolved ?? entry.eager;
				if (!component) throw loadRegistryEntry(entry);
				// Registry keys are selection identity even when two entries
				// intentionally resolve to the same underlying component.
				return createVNode(component, {
					...props,
					key: `exact-registry:${entry.key}`
				});
			};
			if (target !== 'client') return renderSelection;
			const selection = createCompiledDynamicComponent({
				id: `${id}:${key}`,
				source: () => entry.resolved ?? entry.eager ?? loadRegistryEntry(entry),
				props
			});
			return () => selection;
		} as AnyComponentFunction;
		Object.defineProperty(facade, 'name', {
			configurable: true,
			value: `${name}.${key}#${id}`
		});
		attachRegistryFacadeArtifact(facade, id, key, target, lazy !== undefined);
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

/** Attaches the target-local render and loader lane selected for one finite registry key. */
function attachRegistryFacadeArtifact(
	facade: AnyComponentFunction,
	registryId: string,
	key: string,
	target: 'client' | 'server',
	lazy: boolean
): void {
	const identity = `${registryId}:${key}`;
	const implementationId = `${identity}:implementation`;
	const contract: ExactComponentContract = Object.freeze({
		version: 2,
		placement: target,
		role: target === 'client' ? 'client' : 'executor',
		implementations: Object.freeze([
			Object.freeze({
				id: implementationId,
				name: facade.name,
				role: 'root',
				implementation: facade
			})
		]),
		continuations: Object.freeze([]),
		executors: Object.freeze([]),
		boundaries: Object.freeze([]),
		execution: Object.freeze({ version: 1, ports: [], transitions: [], reactive: [] }),
		definition: Object.freeze({
			version: 1,
			instantiate: facade,
			abi: compiledComponentRenderABI,
			state: Object.freeze([]),
			tasks: Object.freeze([]),
			reactive: Object.freeze([]),
			render: 'returned-function',
			capabilities: Object.freeze(
				target === 'client' || lazy
					? (['registry', 'dynamic-components'] as const)
					: (['registry'] as const)
			),
			...(target === 'server'
				? {
						server: Object.freeze({
							version: 1 as const,
							classification: lazy ? ('dynamic' as const) : ('synchronous' as const),
							lane: lazy ? ('generic' as const) : ('direct' as const),
							...(!lazy ? { render: facade } : {})
						})
					}
				: {})
		})
	});
	Object.defineProperties(facade, {
		[exactComponentType]: { configurable: false, enumerable: false, value: identity },
		[exactComponentContract]: { configurable: false, enumerable: false, value: contract }
	});
}

/** Returns a frozen diagnostic snapshot without exposing loaders or component functions. */
export function inspectComponentRegistry(
	registry: AnyComponentRegistry
): ComponentRegistryInspection {
	const runtime = registryValues.get(registry as object);
	if (!runtime) throw new TypeError('inspectComponentRegistry() requires a component registry');
	return Object.freeze({
		id: runtime.id,
		name: runtime.name,
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
export function hasComponent<Registry extends AnyComponentRegistry>(
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
export function renderComponent<Registry extends AnyComponentRegistry>(
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
