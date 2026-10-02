import path from 'node:path';
import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
import type { ExactResolvedComponentCandidate, ExactResolvedPackageInstance } from './contracts.js';

/**
 * Resolves a package-internal component from its published owner edge and canonical identity.
 * Public and cross-package imports still require an export mapping. No implementation is evaluated.
 */
export function selectInternalComponent(
	instance: ExactResolvedPackageInstance,
	candidate: ExactResolvedComponentCandidate,
	buildFacts: ExactPublishedComponentBuildFacts,
	resolvedModule: string
) {
	if (!candidate.moduleSpecifier.startsWith('.')) return undefined;
	const importer = path.relative(instance.root, candidate.importerModuleId);
	if (!importer || importer.startsWith('..') || path.isAbsolute(importer)) return undefined;
	const owner = buildFacts.modules.find((module) => module.path === importer.replaceAll('\\', '/'));
	const identities = new Set(
		owner?.facts.componentImports
			.filter(
				(edge) =>
					edge.moduleSpecifier === candidate.moduleSpecifier &&
					edge.exportName === candidate.exportName &&
					edge.artifactTargets.includes('server') &&
					edge.canonicalComponentId
			)
			.map((edge) => edge.canonicalComponentId) ?? []
	);
	if (identities.size !== 1) return undefined;
	const componentId = [...identities][0]!;
	const module = buildFacts.modules.find((entry) => entry.path === resolvedModule);
	if (!module?.facts.components.some((component) => component.id === componentId)) return undefined;
	return { componentId, module };
}
