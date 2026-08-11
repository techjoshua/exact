import type { AuthoredComponentFunction } from '../component/contracts.js';
import { currentComponentDomain } from '../component/domain.js';
import type { DynamicComponentResolver } from './contracts.js';

const definitions = new WeakMap<Function, DynamicComponentResolver<any>>();

/**
 * Declares a stable JSX component facade whose implementation is selected at runtime on the client.
 *
 * The compiler lowers JSX uses of the facade to an owned dynamic boundary. Calling this helper
 * outside component setup is invalid because no component execution domain can own its resolver.
 */
export function createDynamicComponent<
	Props extends Record<string, unknown> = Record<string, unknown>
>(
	resolve: DynamicComponentResolver<Props>
): AuthoredComponentFunction<Record<string, unknown>, Props> {
	if (!currentComponentDomain())
		throw new Error('createDynamicComponent() must be called during component setup');
	if (typeof resolve !== 'function')
		throw new TypeError('createDynamicComponent() requires a resolver function');
	const facade = function DynamicComponentFacade(): never {
		throw new Error('Dynamic component facades must be lowered by the eXact compiler');
	} as unknown as AuthoredComponentFunction<Record<string, unknown>, Props>;
	definitions.set(facade, resolve);
	return facade;
}

/** Returns the private resolver associated with one authored dynamic facade. */
export function dynamicComponentResolverFor<Props extends Record<string, unknown>>(
	value: unknown
): DynamicComponentResolver<Props> | undefined {
	return typeof value === 'function'
		? (definitions.get(value) as DynamicComponentResolver<Props> | undefined)
		: undefined;
}
