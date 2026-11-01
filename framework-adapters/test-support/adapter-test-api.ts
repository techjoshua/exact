type AdapterTestApi = Pick<typeof import('vitest'), 'describe' | 'it' | 'expect'>;

/** Loads native Bun tests or Vitest, including Bun hosts which wrap dynamic imports in default. */
export async function loadAdapterTestApi(): Promise<AdapterTestApi> {
	const specifier = (globalThis as { Bun?: unknown }).Bun ? 'bun:test' : 'vitest';
	const namespace = await import(specifier);
	return (namespace.default ?? namespace) as AdapterTestApi;
}
