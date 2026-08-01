import type { ExactModuleAnalysis } from '../contracts/module-analysis.js';
import type {
	ExactArtifactBuildProducts,
	ExactArtifactRegistryPlan,
	ExactExecutableBoundaryPlan,
	ExactExecutableOperationPlan,
	ExactHydrationContinuationPlan
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
		source: Object.freeze({
			filename: analysis.filename,
			dependencies: Object.freeze([...analysis.dependencies])
		}),
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
		continuations: Object.freeze(analysis.continuations.map(hydrationContinuationPlan)),
		execution: Object.freeze({
			operations: Object.freeze(analysis.continuations.map(operationPlan)),
			boundaries: Object.freeze(
				analysis.boundaries.map(
					(boundary): ExactExecutableBoundaryPlan => Object.freeze({ ...boundary })
				)
			)
		})
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

function hydrationContinuationPlan(
	continuation: ExactModuleAnalysis['continuations'][number]
): ExactHydrationContinuationPlan {
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

function operationPlan(
	continuation: ExactModuleAnalysis['continuations'][number]
): ExactExecutableOperationPlan {
	return Object.freeze({
		id: continuation.id,
		componentId: continuation.componentId,
		reads: Object.freeze(continuation.activation.stateReads.map((effect) => ({ ...effect }))),
		writes: Object.freeze(continuation.effects.stateWrites.map((effect) => ({ ...effect }))),
		publicContexts: Object.freeze(
			continuation.activation.publicContexts.map((context) => context.token)
		),
		serverContexts: Object.freeze(
			continuation.activation.serverContexts.map((context) => context.token)
		),
		boundaries: Object.freeze([...continuation.effects.boundaries])
	});
}
