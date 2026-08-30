import type { AnyAuthoredComponentFunction, AnyComponentFunction } from '../component/contracts.js';
import { createCompiledComponentReceipt } from '../component-abi/receipt.js';
import type {
	AnyComponentRegistry,
	ComponentRegistryInspection,
	ComponentSelection
} from './contracts.js';
import { invalidRegistryEntry, unsafeComponentRegistryKeys } from './errors.js';
import { loadRegistryEntry, registryEntryFor } from './loading.js';
import { componentRegistryValues } from './storage.js';

/** Returns a frozen diagnostic snapshot without exposing loaders or component functions. */
export function inspectComponentRegistry(
	registry: AnyComponentRegistry
): ComponentRegistryInspection {
	const runtime = componentRegistryValues.get(registry as object);
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
		componentRegistryValues.has(registry as object) &&
		!unsafeComponentRegistryKeys.has(value) &&
		Object.prototype.hasOwnProperty.call(registry, value)
	);
}

/** Preloads a lazy registry facade without constructing a component instance. */
export async function preloadComponent(component: AnyAuthoredComponentFunction): Promise<void> {
	if (typeof component !== 'function')
		throw new TypeError('preloadComponent() requires a component');
	const entry = registryEntryFor(component as AnyComponentFunction);
	if (!entry) return;
	await loadRegistryEntry(entry);
}

/** Issues one correlated heterogeneous registry selection through its target-local artifact. */
export function renderComponent<Registry extends AnyComponentRegistry>(
	registry: Registry,
	selection: ComponentSelection<Registry>
) {
	if (!componentRegistryValues.has(registry as object))
		throw new TypeError('renderComponent() requires a component registry');
	const selected = selection as { component: string; props: Record<string, unknown> };
	if (!hasComponent(registry, selected.component))
		throw invalidRegistryEntry(selected.component, 'key is not present in this registry');
	return createCompiledComponentReceipt(
		registry[selected.component] as AnyComponentFunction,
		selected.props
	);
}
