/** Unsafe property names rejected from every component registry definition. */
export const unsafeComponentRegistryKeys = new Set(['__proto__', 'prototype', 'constructor']);

/** Creates a diagnostic that identifies one invalid registry entry without exposing protocol IDs. */
export function invalidRegistryEntry(key: string, detail: string): TypeError {
	return new TypeError(`Invalid component registry entry "${key}": ${detail}`);
}

/** Asserts that a registry key is finite and safe for a null-prototype immutable record. */
export function assertSafeRegistryKey(key: string): void {
	if (!key || unsafeComponentRegistryKeys.has(key))
		throw invalidRegistryEntry(key, 'keys must be non-empty and prototype-safe');
}
