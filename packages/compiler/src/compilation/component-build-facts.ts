import type { ExactArtifactTarget } from '../contracts/artifacts.js';
import { stableId } from '../ids.js';
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
	const renderImports = analysis.components.flatMap((component) => {
		const targets = Object.freeze([...(component.artifactTargets ?? [])]);
		return component.renderEdges.flatMap((edge) => {
			const binding = edge.moduleSpecifier
				? Object.freeze({
						moduleSpecifier: edge.moduleSpecifier,
						exportName: edge.exportName ?? 'default'
					})
				: imports.get(rootTagName(edge.tag));
			if (binding && compilerOwnedRenderBinding(binding)) return [];
			return binding
				? [componentImport(component.id, binding, targets, 'render', edge.componentId)]
				: [];
		});
	});
	const registryImports = (analysis.registries ?? []).flatMap((registry) =>
		registry.entries.flatMap((entry) =>
			entry.moduleSpecifier
				? [
						componentImport(
							registry.id,
							{
								moduleSpecifier: entry.moduleSpecifier,
								exportName: entry.exportName ?? 'default'
							},
							Object.freeze([...entry.artifactTargets]),
							'registry',
							entry.componentId
						)
					]
				: []
		)
	);
	const moduleRenderImports = (analysis.jsx ?? []).flatMap((element) => {
		if (element.intrinsic) return [];
		const root = rootTagName(element.tag);
		const reference = analysis.semanticGraph?.references.find(
			(value) =>
				value.name === root &&
				value.nodeStart >= element.start &&
				value.nodeEnd <= element.start + element.length
		);
		if (reference?.source !== 'import' || reference.typeOnly || !reference.moduleSpecifier)
			return [];
		const exported =
			reference.importedName === '*'
				? element.tag.slice(root.length + 1)
				: (reference.importedName ?? 'default');
		if (!exported || exported.includes('.')) return [];
		if (
			compilerOwnedRenderBinding({
				moduleSpecifier: reference.moduleSpecifier,
				exportName: exported
			})
		)
			return [];
		if (
			element.ownerComponentId &&
			renderImports.some(
				(value) =>
					value.ownerComponentId === element.ownerComponentId &&
					value.moduleSpecifier === reference.moduleSpecifier &&
					value.exportName === exported
			)
		)
			return [];
		return [
			componentImport(
				element.ownerComponentId ?? stableId(analysis.filename, 'module-render'),
				{
					moduleSpecifier: reference.moduleSpecifier,
					exportName: exported
				},
				Object.freeze(['client', 'server'] as const),
				'render'
			)
		];
	});
	const componentImports = [...renderImports, ...moduleRenderImports, ...registryImports];

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

/** Framework syntax contributes rendering operations rather than external library execution. */
function compilerOwnedRenderBinding(binding: ImportedBinding): boolean {
	return (
		(binding.moduleSpecifier === '@exactjs/core/document' && binding.exportName === 'Document') ||
		(binding.moduleSpecifier === '@exactjs/jsx' &&
			(binding.exportName === '_' || binding.exportName === 'Fragment')) ||
		(binding.moduleSpecifier === '@exactjs/core' &&
			[
				'Activity',
				'Cell',
				'Dynamic',
				'Fragment',
				'Portal',
				'RenderProgram',
				'ServerBoundary',
				'ServerSlot',
				'Suspense',
				'Target',
				'Text',
				'UnsafeHtml'
			].includes(binding.exportName))
	);
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
