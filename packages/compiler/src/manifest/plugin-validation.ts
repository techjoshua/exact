import type { ExactCompilerManifest } from '../types.js';

export function validatePluginEnvelope(
	manifest: Partial<ExactCompilerManifest>,
	source: string,
	kind: string
): void {
	if (manifest.pluginRegistry === undefined && manifest.pluginData === undefined) return;
	const registry = manifest.pluginRegistry;
	if (
		!registry ||
		typeof registry !== 'object' ||
		typeof registry.fingerprint !== 'string' ||
		!registry.plugins ||
		typeof registry.plugins !== 'object' ||
		Array.isArray(registry.plugins)
	) {
		throw new Error(`Malformed eXact ${kind} plugin registry in ${source}`);
	}
	for (const [name, raw] of Object.entries(registry.plugins)) {
		if (!name || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
			throw new Error(`Malformed eXact ${kind} plugin registry in ${source}`);
		}
		const metadata = raw as Record<string, unknown>;
		if (
			typeof metadata.version !== 'string' ||
			typeof metadata.protocolVersion !== 'string' ||
			typeof metadata.required !== 'boolean' ||
			!isJsonSafe(metadata.compilerConfigKey)
		) {
			throw new Error(`Malformed eXact ${kind} plugin registry in ${source}`);
		}
	}
	if (manifest.pluginData !== undefined) {
		if (
			!manifest.pluginData ||
			typeof manifest.pluginData !== 'object' ||
			Array.isArray(manifest.pluginData)
		) {
			throw new Error(`Malformed eXact ${kind} plugin data in ${source}`);
		}
		for (const [name, value] of Object.entries(manifest.pluginData)) {
			if (!(name in registry.plugins) || !isJsonSafe(value)) {
				throw new Error(`Malformed eXact ${kind} plugin data in ${source}`);
			}
		}
	}
}

function isJsonSafe(value: unknown): boolean {
	const seen = new Set<object>();
	const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
	let nodes = 0;
	while (pending.length) {
		const current = pending.pop()!;
		if (++nodes > 10_000 || current.depth > 32) return false;
		const item = current.value;
		if (item === null || typeof item === 'string' || typeof item === 'boolean') continue;
		if (typeof item === 'number' && Number.isFinite(item)) continue;
		if (!item || typeof item !== 'object' || seen.has(item)) return false;
		seen.add(item);
		if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) return false;
		for (const child of Object.values(item))
			pending.push({ value: child, depth: current.depth + 1 });
	}
	return true;
}
