import type { ExactInspectionRedactionCatalog } from './identity.js';

/** Merges catalog selectors deterministically, preserving structured context-token rules. */
export function mergeInspectionRedactions(
	generated: readonly ExactInspectionRedactionCatalog[],
	configured: Partial<ExactInspectionRedactionCatalog> = {}
): ExactInspectionRedactionCatalog {
	return {
		statePaths: [
			...new Set([
				...generated.flatMap((value) => value.statePaths),
				...(configured.statePaths ?? [])
			])
		].sort(),
		contextTokens: [
			...generated.flatMap((value) => value.contextTokens),
			...(configured.contextTokens ?? [])
		],
		secretNames: [
			...new Set([
				...generated.flatMap((value) => value.secretNames),
				...(configured.secretNames ?? [])
			])
		].sort()
	};
}
