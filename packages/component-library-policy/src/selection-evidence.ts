import type {
	ExactComponentBuildFacts,
	ExactPublishedComponentBuildFacts
} from '@exactjs/compiler';

/**
 * Routes reached uncertain edges to server authorization without granting execution.
 * Empty inferred targets express uncertainty, so the selected package must supply its own evidence.
 */
export function requiresExactServerComponentSelection(
	edge: ExactComponentBuildFacts['componentImports'][number]
): boolean {
	return !edge.artifactTargets.length || edge.artifactTargets.includes('server');
}

/** Validates inert relative selection joins using the policy owner's canonical path rules. */
export function validatePublishedRelativeSelections(
	modules: ReadonlyMap<string, ExactPublishedComponentBuildFacts['modules'][number]>,
	normalize: (module: string) => string,
	invalid: (message: string) => never
): void {
	for (const module of modules.values()) {
		const selections = new Map<string, string>();
		for (const edge of module.facts.componentImports) {
			if (edge.executable === undefined) continue;
			const selected = edge.executable;
			if (
				!selected ||
				typeof selected !== 'object' ||
				!['client', 'server'].includes(selected.target) ||
				typeof selected.module !== 'string' ||
				!selected.module ||
				normalize(selected.module) !== selected.module ||
				!edge.moduleSpecifier.startsWith('.') ||
				!edge.canonicalComponentId ||
				!modules
					.get(selected.module)
					?.facts.components.some((c) => c.id === edge.canonicalComponentId)
			)
				invalid('invalid inspected relative component destination');
			const key = [edge.ownerComponentId, edge.moduleSpecifier, edge.exportName].join('\0');
			const destination = [selected.target, selected.module, edge.canonicalComponentId].join('\0');
			if (selections.has(key) && selections.get(key) !== destination)
				invalid('conflicting inspected relative component selections');
			selections.set(key, destination);
		}
	}
}
