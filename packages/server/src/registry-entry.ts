/** Reads only an explicitly registered own entry, never authority inherited from a prototype. */
export function ownRegistryEntry<T>(
	registry: Readonly<Record<string, T>> | undefined,
	id: string
): T | undefined {
	return registry && Object.hasOwn(registry, id) ? registry[id] : undefined;
}
