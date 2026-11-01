import { requiresExactServerComponentSelection } from './selection-evidence.js';
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
	if (
		!importer ||
		importer === '..' ||
		importer.startsWith(`..${path.sep}`) ||
		path.isAbsolute(importer)
	)
		return undefined;
	const owner = buildFacts.modules.find((module) => module.path === importer.replaceAll('\\', '/'));
	const identities = new Set(
		owner?.facts.componentImports
			.filter(
				(edge) =>
					edge.moduleSpecifier === candidate.moduleSpecifier &&
					edge.exportName === candidate.exportName &&
					requiresExactServerComponentSelection(edge) &&
					(edge.executable === undefined ||
						(edge.executable.target === 'server' && edge.executable.module === resolvedModule)) &&
					edge.canonicalComponentId
			)
			.map((edge) => edge.canonicalComponentId) ?? []
	);
	if (identities.size !== 1) return undefined;
	const componentId = [...identities][0]!;
	const module = buildFacts.modules.find((entry) => entry.path === resolvedModule);
	const component = module?.facts.components.find((component) => component.id === componentId);
	if (!module || !component) return undefined;
	const matching = owner!.facts.componentImports.filter(
		(edge) =>
			edge.moduleSpecifier === candidate.moduleSpecifier &&
			edge.exportName === candidate.exportName &&
			edge.canonicalComponentId === componentId
	);
	if (
		(component.placement === 'unknown' ||
			!component.artifactTargets.length ||
			matching.some((edge) => !edge.artifactTargets.length)) &&
		!matching.some(
			(edge) => edge.executable?.target === 'server' && edge.executable.module === resolvedModule
		)
	)
		return undefined;
	return { componentId, module };
}
