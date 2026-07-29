import type { ComponentFunction } from '../component/contracts.js';
import type { ComponentRegistryEntryRuntime } from './contracts.js';
import { invalidRegistryEntry } from './errors.js';

const entryByFacade = new WeakMap<ComponentFunction<any, any>, ComponentRegistryEntryRuntime>();

/** Associates a stable component facade with its private registry entry contract. */
export function registerRegistryFacade(entry: ComponentRegistryEntryRuntime): void {
	entryByFacade.set(entry.facade, entry);
}

/** Returns private registry entry metadata for a generated facade. */
export function registryEntryFor(
	component: ComponentFunction<any, any>
): ComponentRegistryEntryRuntime | undefined {
	return entryByFacade.get(component);
}

/**
 * Resolves and validates one registry entry, deduplicating concurrent consumers.
 *
 * Successful component identity is retained. A rejected load is cleared so an explicit preload
 * or ErrorBoundary reset can retry; individual consumer cancellation never cancels the import.
 */
export function loadRegistryEntry(
	entry: ComponentRegistryEntryRuntime
): Promise<ComponentFunction<any, any>> {
	if (entry.resolved) return Promise.resolve(entry.resolved);
	if (entry.eager) {
		entry.resolved = entry.eager;
		return Promise.resolve(entry.eager);
	}
	if (entry.pending) return entry.pending;
	if (!entry.load)
		return Promise.reject(invalidRegistryEntry(entry.key, 'entry has no component loader'));

	entry.error = undefined;
	entry.loadGeneration++;
	const pending = Promise.resolve()
		.then(entry.load)
		.then((component) => {
			if (typeof component !== 'function')
				throw invalidRegistryEntry(entry.key, 'lazy loader did not resolve to a component');
			entry.resolved = component;
			entry.pending = undefined;
			return component;
		})
		.catch((error) => {
			entry.error = error;
			entry.pending = undefined;
			throw error;
		});
	entry.pending = pending;
	return pending;
}
