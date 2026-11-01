import type { ExactInspectionRedactionCatalog } from './identity.js';

/**
 * Merges sorted, deduplicated state paths and secret names without mutating caller catalogs.
 * Structured context rules retain their order and object identity.
 */
export function mergeInspectionRedactions(
	generated: readonly ExactInspectionRedactionCatalog[],
	configured: Partial<ExactInspectionRedactionCatalog> = {}
): ExactInspectionRedactionCatalog {
	const statePaths = new Set(configured.statePaths);
	const secretNames = new Set(configured.secretNames);
	for (const catalog of generated) {
		for (const path of catalog.statePaths) statePaths.add(path);
		for (const name of catalog.secretNames) secretNames.add(name);
	}
	return {
		statePaths: [...statePaths].sort(),
		contextTokens: [
			...generated.flatMap((value) => value.contextTokens),
			...(configured.contextTokens ?? [])
		],
		secretNames: [...secretNames].sort()
	};
}
