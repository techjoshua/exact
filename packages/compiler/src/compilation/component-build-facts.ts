import type { ExactArtifactTarget } from '../contracts/artifacts.js';
import type { ExactModuleAnalysis } from '../contracts/module-analysis.js';
import type {
	ExactComponentBuildFacts,
	ExactComponentImportReason
} from '../contracts/transform.js';

type ImportedBinding = Readonly<{
	moduleSpecifier: string;
	exportName: string;
}>;

/**
 * Projects ephemeral compiler analysis into the target-neutral component protocol.
 *
 * The result is descriptive only. Authored module specifiers and package-name hints
 * must be joined to resolver-owned package instances before they can be trusted.
 */
export function createExactComponentBuildFacts(
	analysis: ExactModuleAnalysis
): ExactComponentBuildFacts {
	const imports = importedBindings(analysis);
	const componentImports = analysis.components.flatMap((component) => {
		const targets = Object.freeze([...(component.artifactTargets ?? [])]);
		return component.renderEdges.flatMap((edge) => {
			const binding = edge.moduleSpecifier
				? Object.freeze({
						moduleSpecifier: edge.moduleSpecifier,
						exportName: edge.exportName ?? 'default'
					})
				: imports.get(rootTagName(edge.tag));
			return binding
				? [componentImport(component.id, binding, targets, 'render', edge.componentId)]
				: [];
		});
	});

	return Object.freeze({
		protocol: 1 as const,
		filename: analysis.filename,
		...(analysis.packageName ? { packageName: analysis.packageName } : {}),
		components: Object.freeze(
			analysis.components.map((component) =>
				Object.freeze({
					id: component.id,
					placement: component.placement,
					artifactTargets: Object.freeze([...(component.artifactTargets ?? [])])
				})
			)
		),
		componentImports: Object.freeze(componentImports),
		rendererEnhancements: Object.freeze(
			analysis.rendererEnhancements.map((enhancement) => Object.freeze({ ...enhancement }))
		)
	});
}

function importedBindings(analysis: ExactModuleAnalysis): ReadonlyMap<string, ImportedBinding> {
	const result = new Map<string, ImportedBinding>();
	for (const declaration of analysis.semanticGraph?.declarations ?? []) {
		if (declaration.kind !== 'import' || declaration.typeOnly || !declaration.moduleSpecifier)
			continue;
		result.set(
			declaration.name,
			Object.freeze({
				moduleSpecifier: declaration.moduleSpecifier,
				exportName: declaration.importedName ?? 'default'
			})
		);
	}
	return result;
}

function rootTagName(tag: string): string {
	return tag.split('.')[0] ?? tag;
}

function componentImport(
	ownerComponentId: string,
	binding: ImportedBinding,
	artifactTargets: readonly ExactArtifactTarget[],
	reason: ExactComponentImportReason,
	canonicalComponentId?: string
): ExactComponentBuildFacts['componentImports'][number] {
	return Object.freeze({
		ownerComponentId,
		moduleSpecifier: binding.moduleSpecifier,
		exportName: binding.exportName,
		...(canonicalComponentId ? { canonicalComponentId } : {}),
		artifactTargets,
		reason
	});
}
