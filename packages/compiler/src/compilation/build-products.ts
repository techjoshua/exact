import type { ExactModuleAnalysis } from '../contracts/module-analysis.js';
import type {
	ExactArtifactBuildProducts,
	ExactArtifactBoundaryPlan,
	ExactArtifactRegistryPlan,
	ExactTaskOperationPlan
} from '../contracts/artifacts.js';

/** Projects ephemeral semantic analysis into the narrow products supported by build adapters. */
export function createArtifactBuildProducts(
	inputFile: string,
	analysis: ExactModuleAnalysis
): ExactArtifactBuildProducts {
	const continuationComponents = new Set(
		analysis.continuations.map((continuation) => continuation.componentId)
	);
	return Object.freeze({
		dependencies: Object.freeze([...analysis.dependencies]),
		componentIds: Object.freeze(analysis.components.map((component) => component.id)),
		exposureRoots: Object.freeze(
			analysis.symbols.flatMap((symbol) =>
				symbol.role === 'root' &&
				symbol.kind === 'component' &&
				symbol.componentId &&
				symbol.exportName
					? [Object.freeze({ componentId: symbol.componentId, exportName: symbol.exportName })]
					: []
			)
		),
		componentEdges: Object.freeze(
			analysis.components.flatMap((component) =>
				component.renderEdges.map((edge) =>
					Object.freeze({
						id: edge.id,
						sourceFile: inputFile,
						sourceComponentId: component.id,
						sourceName: component.name,
						targetComponentId: edge.componentId,
						targetName: edge.name,
						tag: edge.tag,
						placement: edge.placement,
						boundary: edge.boundary,
						index: edge.index,
						path: edge.path
					})
				)
			)
		),
		clientRegistrations: Object.freeze(
			analysis.symbols.flatMap((symbol) =>
				clientRegistrySymbol(symbol, continuationComponents) ? [registryPlan(symbol)] : []
			)
		),
		serverRegistrations: Object.freeze(
			analysis.symbols.flatMap((symbol) => {
				if (symbol.role !== 'server-part' || symbol.target !== 'server' || !symbol.exportName)
					return [];
				return [registryPlan(symbol as typeof symbol & { exportName: string })];
			})
		),
		operations: Object.freeze(analysis.continuations.map(taskOperationPlan)),
		boundaries: Object.freeze(
			analysis.boundaries.map(
				(boundary): ExactArtifactBoundaryPlan =>
					Object.freeze({
						...boundary,
						...(boundary.patchTargets
							? { patchTargets: Object.freeze([...boundary.patchTargets]) }
							: {}),
						...(boundary.discriminatorValues
							? { discriminatorValues: Object.freeze([...boundary.discriminatorValues]) }
							: {})
					})
			)
		),
		partitionPlan: Object.freeze({
			...analysis.partitionPlan,
			roots: Object.freeze([...analysis.partitionPlan.roots]),
			nodes: Object.freeze(
				analysis.partitionPlan.nodes.map((node) =>
					Object.freeze({
						...node,
						artifactTargets: Object.freeze([...node.artifactTargets]),
						renderPath: Object.freeze([...node.renderPath]),
						childEdges: Object.freeze([...node.childEdges])
					})
				)
			),
			edges: Object.freeze(
				analysis.partitionPlan.edges.map((edge) =>
					Object.freeze({
						...edge,
						data: Object.freeze(edge.data.map((slot) => Object.freeze({ ...slot }))),
						renderPath: Object.freeze([...edge.renderPath])
					})
				)
			)
		}) as ExactModuleAnalysis['partitionPlan']
	});
}

function registryPlan(
	symbol: ExactModuleAnalysis['symbols'][number] & { exportName: string }
): ExactArtifactRegistryPlan {
	return Object.freeze({
		id: symbol.id,
		name: symbol.generatedName,
		exportName: symbol.exportName,
		...(symbol.componentId ? { componentId: symbol.componentId } : {})
	});
}

function clientRegistrySymbol(
	symbol: ExactModuleAnalysis['symbols'][number],
	continuationComponents: ReadonlySet<string>
): symbol is ExactModuleAnalysis['symbols'][number] & { exportName: string } {
	if (!symbol.exportName) return false;
	return (
		(symbol.target === 'client' &&
			(symbol.role === 'client-island' ||
				(symbol.role === 'root' &&
					symbol.kind === 'component' &&
					symbol.placement === 'client'))) ||
		(symbol.target === 'both' &&
			symbol.role === 'root' &&
			symbol.kind === 'component' &&
			!!symbol.componentId &&
			continuationComponents.has(symbol.componentId))
	);
}

function taskOperationPlan(
	continuation: ExactModuleAnalysis['continuations'][number]
): ExactTaskOperationPlan {
	return Object.freeze({
		kind: 'task',
		id: continuation.id,
		componentId: continuation.componentId,
		readiness: continuation.readiness,
		dependencies: Object.freeze(
			continuation.activation.dependencies.map(({ source }) => Object.freeze({ source }))
		),
		stateReads: Object.freeze(
			continuation.activation.stateReads.map(({ path, kind, confidence }) =>
				Object.freeze({ path, kind, confidence })
			)
		),
		stateWrites: Object.freeze(
			continuation.effects.stateWrites.map(({ path, kind, confidence }) =>
				Object.freeze({ path, kind, confidence })
			)
		),
		publicContexts: Object.freeze(
			continuation.activation.publicContexts.map((context) => context.token)
		),
		serverContexts: Object.freeze(
			continuation.activation.serverContexts.map((context) => context.token)
		),
		contextWrites: Object.freeze(
			continuation.effects.contextWrites.map((context) => context.token)
		),
		serverContextWrites: Object.freeze(
			continuation.effects.serverContextWrites.map((context) => context.token)
		),
		boundaries: Object.freeze([...continuation.effects.boundaries]),
		...(continuation.invocation
			? {
					invocation: Object.freeze({
						arguments: Object.freeze(
							continuation.invocation.arguments.map(() =>
								Object.freeze({ source: 'argument' as const })
							)
						),
						concurrency: continuation.invocation.concurrency
					})
				}
			: {})
	});
}
