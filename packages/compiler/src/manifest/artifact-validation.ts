import type { ExactArtifactManifest } from '../types.js';

/** Reports whether exact artifact manifest. */
export function isExactArtifactManifest(value: unknown): value is ExactArtifactManifest {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.source === 'string' &&
		typeof record.client === 'string' &&
		typeof record.server === 'string' &&
		(record.shared === undefined || typeof record.shared === 'string') &&
		typeof record.manifest === 'string' &&
		!!record.targets &&
		typeof record.targets === 'object' &&
		!Array.isArray(record.targets) &&
		(record.targets as Record<string, unknown>).client === 'client' &&
		(record.targets as Record<string, unknown>).server === 'server' &&
		((record.targets as Record<string, unknown>).shared === undefined ||
			(record.targets as Record<string, unknown>).shared === 'shared') &&
		Array.isArray(record.exports) &&
		Array.isArray(record.symbols) &&
		Array.isArray(record.boundaries)
	);
}
