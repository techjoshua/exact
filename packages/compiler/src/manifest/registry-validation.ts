import type { ExactComponentRegistryIR } from '../types.js';

/** Validates one finite component registry analysis contract loaded from a manifest. */
export function isExactComponentRegistry(value: unknown): value is ExactComponentRegistryIR {
	if (!record(value) || typeof value.id !== 'string' || typeof value.name !== 'string')
		return false;
	if (!value.id || !value.name || !Array.isArray(value.entries) || !value.entries.length)
		return false;
	const keys = new Set<string>();
	for (const entry of value.entries) {
		if (
			!record(entry) ||
			typeof entry.key !== 'string' ||
			!entry.key ||
			entry.key === '__proto__' ||
			entry.key === 'prototype' ||
			entry.key === 'constructor' ||
			keys.has(entry.key) ||
			(entry.mode !== 'eager' && entry.mode !== 'lazy') ||
			typeof entry.componentId !== 'string' ||
			typeof entry.componentName !== 'string' ||
			!['client', 'server', 'isomorphic', 'unknown'].includes(String(entry.placement)) ||
			(entry.ownership !== 'exact' && entry.ownership !== 'react-compat') ||
			!Array.isArray(entry.artifactTargets) ||
			entry.artifactTargets.some((target) => target !== 'client' && target !== 'server') ||
			(entry.moduleSpecifier !== undefined && typeof entry.moduleSpecifier !== 'string') ||
			(entry.exportName !== undefined && typeof entry.exportName !== 'string')
		)
			return false;
		keys.add(entry.key);
	}
	return true;
}

function record(value: unknown): value is Record<string, any> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
