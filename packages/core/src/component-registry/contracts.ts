import type { ComponentFunction, ComponentInstance, RenderResult } from '../component/contracts.js';

/** Private type-level identity carried by a component registry. */
export declare const componentRegistryBrand: unique symbol;
/** Private type-level identity carried by a scoped lazy definition entry. */
export declare const lazyRegistryEntryBrand: unique symbol;

/** Declarative lazy component entry accepted only inside a registry definition callback. */
export type LazyRegistryEntry<Component extends ComponentFunction<any, any>> = Readonly<{
	readonly [lazyRegistryEntryBrand]: Component;
}>;

/** One eager or scoped-lazy entry in a declarative component registry definition. */
export type ComponentRegistryDefinitionEntry =
	| ComponentFunction<any, any>
	| LazyRegistryEntry<ComponentFunction<any, any>>;

/** Finite immutable definition accepted by {@link createComponentRegistry}. */
export type ComponentRegistryDefinition = Readonly<
	Record<string, ComponentRegistryDefinitionEntry>
>;

/** Resolves a definition descriptor to the authored component exposed at use sites. */
export type ResolveRegistryEntry<Entry> =
	Entry extends LazyRegistryEntry<infer Component>
		? Component
		: Entry extends ComponentFunction<any, any>
			? Entry
			: never;

/** Resolves every definition entry to its public component type. */
export type ResolveRegistryDefinition<Definition extends ComponentRegistryDefinition> = {
	readonly [Key in keyof Definition]: ResolveRegistryEntry<Definition[Key]>;
};

/** Immutable branded collection of stable registry entry component facades. */
export type ComponentRegistry<Definition extends ComponentRegistryDefinition> =
	ResolveRegistryDefinition<Definition> & {
		readonly [componentRegistryBrand]: Definition;
	};

/** String component keys declared by a registry, excluding compiler-private symbols. */
export type KeyOf<Registry> =
	Registry extends ComponentRegistry<infer Definition> ? Extract<keyof Definition, string> : never;

/** Props accepted by an eXact component function. */
export type ComponentProps<Component> =
	Component extends ComponentFunction<any, infer Props> ? Props : never;

/** Builder available only while a registry definition callback executes. */
export type ComponentRegistryBuilder = {
	/**
	 * Declares a statically analyzable lazy component loader.
	 *
	 * Reading the resulting registry entry does not load it; rendering or explicit preloading does.
	 */
	lazy<Component extends ComponentFunction<any, any>>(
		load: () => Promise<Component>
	): LazyRegistryEntry<Component>;
};

/** Correlated key and props union derived from a heterogeneous registry. */
export type ComponentSelection<Registry> =
	Registry extends ComponentRegistry<infer Definition>
		? {
				[Key in Extract<keyof Definition, string>]: {
					component: Key;
					props: ComponentProps<ResolveRegistryEntry<Definition[Key]>>;
				};
			}[Extract<keyof Definition, string>]
		: never;

/** Runtime metadata for one stable target-local registry entry facade. */
export type ComponentRegistryEntryRuntime = {
	readonly registry: ComponentRegistryRuntime;
	readonly key: string;
	readonly facade: ComponentFunction<any, any>;
	readonly eager?: ComponentFunction<any, any>;
	readonly load?: () => Promise<ComponentFunction<any, any>>;
	resolved?: ComponentFunction<any, any>;
	pending?: Promise<ComponentFunction<any, any>>;
	error?: unknown;
	loadGeneration: number;
};

/** Runtime metadata for one immutable registry value. */
export type ComponentRegistryRuntime = {
	readonly id?: string;
	readonly name?: string;
	readonly entries: ReadonlyMap<string, ComponentRegistryEntryRuntime>;
};

/** Immutable diagnostic view of one compiler-owned component registry. */
export type ComponentRegistryInspection = Readonly<{
	id?: string;
	name?: string;
	entries: readonly Readonly<{
		key: string;
		mode: 'eager' | 'lazy';
		status: 'ready' | 'loading' | 'failed' | 'idle';
		generation: number;
	}>[];
}>;

/** Internal component shape used by generated entry facades. */
export type RegistryFacadeInstance = ComponentInstance<Record<string, never>>;

/** Public render result returned by correlated registry selection. */
export type RegistryRenderResult = RenderResult;
