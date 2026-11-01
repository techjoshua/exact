import { captureActivationDecision, capturePartitionPlan } from './analysis-projections.js';
import type { ExactModuleAnalysis } from '../contracts/module-analysis.js';
import type {
	ExactArtifactBuildProducts,
	ExactArtifactBoundaryPlan,
	ExactArtifactRegistryPlan,
	ExactTaskOperationPlan
} from '../contracts/artifacts.js';
import { createExactComponentBuildFacts } from './component-build-facts.js';

/** Projects ephemeral semantic analysis into the narrow products supported by build adapters. */
export function createArtifactBuildProducts(
	inputFile: string,
	analysis: ExactModuleAnalysis
): ExactArtifactBuildProducts {
	const registrationOwners = new Set([
		...analysis.continuations.map((continuation) => continuation.componentId),
		...analysis.components
			.filter((component) => component.standaloneClientActivation)
			.map((component) => component.id)
	]);
	return {
		componentBuild: createExactComponentBuildFacts(analysis),
		dependencies: [...analysis.dependencies],
		componentIds: analysis.components.map((component) => component.id),
		exposureRoots: analysis.symbols.flatMap((symbol) =>
			symbol.role === 'root' &&
			symbol.kind === 'component' &&
			symbol.componentId &&
			symbol.exportName
				? [{ componentId: symbol.componentId, exportName: symbol.exportName }]
				: []
		),
		componentEdges: analysis.components.flatMap((component) =>
			component.renderEdges.map((edge) => ({
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
			}))
		),
		clientRegistrations: analysis.symbols.flatMap((symbol) =>
			clientRegistrySymbol(symbol, registrationOwners)
				? [registryPlan(symbol, analysis.boundaries)]
				: []
		),
		serverRegistrations: analysis.symbols.flatMap((symbol) => {
			if (symbol.role !== 'server-part' || symbol.target !== 'server' || !symbol.exportName)
				return [];
			return [registryPlan(symbol as typeof symbol & { exportName: string }, analysis.boundaries)];
		}),
		operations: analysis.continuations.map(taskOperationPlan),
		boundaries: analysis.boundaries.map(
			(boundary): ExactArtifactBoundaryPlan => ({
				...boundary,
				...(boundary.patchTargets ? { patchTargets: [...boundary.patchTargets] } : {}),
				...(boundary.discriminatorValues
					? { discriminatorValues: [...boundary.discriminatorValues] }
					: {}),
				...(boundary.activation
					? { activation: captureActivationDecision(boundary.activation) }
					: {})
			})
		),
		partitionPlan: capturePartitionPlan(analysis.partitionPlan)
	};
}

function registryPlan(
	symbol: ExactModuleAnalysis['symbols'][number] & { exportName: string },
	boundaries: ExactModuleAnalysis['boundaries']
): ExactArtifactRegistryPlan {
	const activation = boundaries.find(
		(boundary) =>
			boundary.kind === 'client-island' &&
			(boundary.id === symbol.id || boundary.name === symbol.generatedName)
	)?.activation;
	return {
		id: symbol.id,
		name: symbol.generatedName,
		exportName: symbol.exportName,
		...(symbol.componentId ? { componentId: symbol.componentId } : {}),
		...(activation ? { activation: captureActivationDecision(activation) } : {})
	};
}

function clientRegistrySymbol(
	symbol: ExactModuleAnalysis['symbols'][number],
	registrationOwners: ReadonlySet<string>
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
			registrationOwners.has(symbol.componentId))
	);
}

function taskOperationPlan(
	continuation: ExactModuleAnalysis['continuations'][number]
): ExactTaskOperationPlan {
	return {
		kind: 'task',
		id: continuation.id,
		componentId: continuation.componentId,
		readiness: continuation.readiness,
		concurrency: continuation.concurrency,
		...(continuation.progress?.length
			? {
					progress: continuation.progress.map((receiver) => ({ ...receiver }))
				}
			: {}),
		dependencies: continuation.activation.dependencies.map(({ index, source, path }) => ({
			index,
			source,
			...(path ? { path } : {})
		})),
		stateReads: continuation.activation.stateReads.map(({ path, kind, confidence, operation }) => ({
			path,
			kind,
			confidence,
			...(operation ? { operation } : {})
		})),
		stateWrites: continuation.effects.stateWrites.map(({ path, kind, confidence, operation }) => ({
			path,
			kind,
			confidence,
			...(operation ? { operation } : {})
		})),
		publicContexts: continuation.activation.publicContexts.map((context) => context.token),
		serverContexts: continuation.activation.serverContexts.map((context) => context.token),
		contextWrites: continuation.effects.contextWrites.map((context) => context.token),
		serverContextWrites: continuation.effects.serverContextWrites.map((context) => context.token),
		boundaries: [...continuation.effects.boundaries],
		...(continuation.invocation
			? {
					invocation: {
						arguments: continuation.invocation.arguments.map(({ index, source, path }) => ({
							index,
							source,
							...(path ? { path } : {})
						})),
						concurrency: continuation.invocation.concurrency
					}
				}
			: {})
	};
}
