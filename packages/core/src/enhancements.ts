import type {
	ComponentFunction,
	CompiledEnhancementNode,
	ContextToken,
	EnhancementEntry,
	EnhancementMarker
} from './component/contracts.js';

/** Global property carrying compiler-derived context effects needed before enhancement activation. */
export const exactEnhancementContexts = Symbol.for('@exactjs/enhancement-contexts');
const exactEnhancementPassThroughBrand = Symbol.for('@exactjs/enhancement-pass-through');

type BrandedEnhancementComponent = ComponentFunction<any, Record<string, unknown>> & {
	[exactEnhancementPassThroughBrand]?: true;
};

/**
 * Shared stateless provider used when an optional enhancement implementation is unavailable.
 *
 * Enhanced renderers recognize its brand before component construction, so this function is an
 * ordinary facade value without creating an instance, scope, wrapper, marker, or inspection event.
 */
export const exactEnhancementPassThrough: ComponentFunction<
	any,
	Record<string, unknown>
> = Object.defineProperty(
	function ExactEnhancementPassThrough(_props: Record<string, unknown>) {
		return () => _props.children as any;
	},
	exactEnhancementPassThroughBrand,
	{ value: true }
) as ComponentFunction<any, Record<string, unknown>>;

/** Reports whether a generated facade selected the shared zero-instance pass-through provider. */
export function isExactEnhancementPassThrough(value: unknown): boolean {
	return (
		typeof value === 'function' &&
		(value as BrandedEnhancementComponent)[exactEnhancementPassThroughBrand] === true
	);
}

/** Minimal context effects used to order co-targeted ordinary components. */
export interface EnhancementContextContract {
	readonly provides?: readonly symbol[];
	readonly requires?: readonly symbol[];
	readonly optionallyConsumes?: readonly symbol[];
}

/** Creates the opaque grouped marker used by compiler-owned JSX enhancement lowering. */
export function createEnhancementNode(
	entries: readonly EnhancementEntry[]
): CompiledEnhancementNode {
	const identities = new Set<string>();
	const normalized = entries.map((entry) => {
		if (!entry.identity) throw new TypeError('An enhancement entry requires a canonical identity');
		if (identities.has(entry.identity))
			throw new Error(`Duplicate enhancement identity "${entry.identity}" at one JSX boundary`);
		identities.add(entry.identity);
		return Object.freeze({
			identity: entry.identity,
			props: Object.freeze({ ...entry.props }),
			...(entry.root === undefined ? {} : { root: entry.root })
		});
	});
	return Object.freeze({
		kind: 'enhancement' as const,
		entries: Object.freeze(normalized),
		fallback: 'preserve-target' as const
	});
}

/**
 * Creates the legacy marker shape while preserving the canonical enhancement-node semantics.
 * @deprecated Compiler output now calls createEnhancementNode.
 */
export const createEnhancementMarker: (entries: readonly EnhancementEntry[]) => EnhancementMarker =
	createEnhancementNode;

/** Copies an object while omitting a compiler-proven finite set of namespaced enhancement keys. */
export function omitKnownProps(
	value: Readonly<Record<PropertyKey, unknown>>,
	keys: readonly PropertyKey[]
): Record<PropertyKey, unknown> {
	const result = { ...value };
	for (const key of keys) delete result[key];
	return result;
}

/**
 * Attaches context effects for a compilerless component capability.
 *
 * Native compilation emits the same token-identity contract from `setContext`, `getContext`, and
 * `hasContext` analysis. This helper exists for packages distributed as ordinary TypeScript output.
 */
export function markExactEnhancementContexts<Component extends ComponentFunction<any, any>>(
	component: Component,
	contract: Readonly<{
		provides?: readonly ContextToken<unknown>[];
		requires?: readonly ContextToken<unknown>[];
		optionallyConsumes?: readonly ContextToken<unknown>[];
	}>
): Component {
	const normalized: EnhancementContextContract = Object.freeze({
		...(contract.provides
			? { provides: Object.freeze(contract.provides.map((token) => token.id)) }
			: {}),
		...(contract.requires
			? { requires: Object.freeze(contract.requires.map((token) => token.id)) }
			: {}),
		...(contract.optionallyConsumes
			? {
					optionallyConsumes: Object.freeze(contract.optionallyConsumes.map((token) => token.id))
				}
			: {})
	});
	Object.defineProperty(component, exactEnhancementContexts, {
		configurable: false,
		enumerable: false,
		value: normalized,
		writable: false
	});
	return component;
}

/** Reads the pre-activation context effects carried by one component value. */
export function readExactEnhancementContexts(
	component: ComponentFunction<any, any>
): EnhancementContextContract | undefined {
	return (
		component as ComponentFunction<any, any> & {
			readonly [exactEnhancementContexts]?: EnhancementContextContract;
		}
	)[exactEnhancementContexts];
}
