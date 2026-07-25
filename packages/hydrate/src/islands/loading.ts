import { composeExactComponentContracts, type ComponentFunction } from '@exactjs/core';
import { mergeHydrationRegistration } from '../config.js';
import type { ClientIslandLoader, HydrateOptions } from '../types.js';

const pendingLoads = new WeakMap<ClientIslandLoader, Promise<ComponentFunction<any, any>>>();

/** Creates a compiler-facing lazy island registry entry without conflating loaders and components. */
export function lazyClientIsland(
	load: () => Promise<ComponentFunction<any, any>>
): ClientIslandLoader {
	return Object.freeze({ load });
}

/** Resolves and registers one lazy component exactly once for every shared loader entry. */
export function loadClientIsland(
	entry: ClientIslandLoader,
	options: HydrateOptions
): Promise<ComponentFunction<any, any>> {
	let pending = pendingLoads.get(entry);
	if (!pending) {
		pending = entry.load().then((component) => {
			if (typeof component !== 'function')
				throw new TypeError('An eXact client island loader must resolve to a component function');
			const contracts = composeExactComponentContracts([component], 'client');
			mergeHydrationRegistration(options, {
				continuations: contracts.continuations
			});
			return component;
		});
		pendingLoads.set(entry, pending);
	}
	return pending;
}

/** Reports whether one registry value is an unambiguous lazy island loader. */
export function isClientIslandLoader(value: unknown): value is ClientIslandLoader {
	return (
		!!value &&
		typeof value === 'object' &&
		typeof (value as Partial<ClientIslandLoader>).load === 'function'
	);
}
