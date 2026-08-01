import type {
	ExactArtifactGraph,
	ExactExecutableBoundaryPlan,
	ExactExecutableOperationPlan,
	ExactExecutionContractPlan
} from './contracts/artifacts.js';
import type { ExactSourceInspection } from './language-tools/contracts.js';
import path from 'node:path';

/** Compiler-produced operation authority required by a selected exposure. */
export type ExactExposureOperationPlan = ExactExecutableOperationPlan;

/** Compiler-produced boundary authority required by a selected exposure. */
export type ExactExposureBoundaryPlan = ExactExecutableBoundaryPlan;

/** Narrow executable contract plan for one selected exposure graph. */
export type ExactExposureExecutionPlan = ExactExecutionContractPlan;

/** Server-owned source catalog scoped to one microfrontend exposure graph. */
export type ExactExposureInspectionCatalog = Readonly<{
	version: 1;
	rootComponentId: string;
	files: readonly ExactSourceInspection[];
}>;

/** Returns component ids reachable through authored render edges from one explicit root. */
export function exactReachableExposureComponents(
	graph: ExactArtifactGraph,
	rootComponentId: string
): ReadonlySet<string> {
	const known = new Set(graph.artifacts.flatMap((artifact) => artifact.build.componentIds));
	if (!known.has(rootComponentId))
		throw new Error(`Unknown eXact exposure root component ${rootComponentId}`);
	const reachable = new Set([rootComponentId]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const edge of graph.componentEdges) {
			if (!reachable.has(edge.sourceComponentId) || !edge.targetComponentId) continue;
			if (reachable.has(edge.targetComponentId)) continue;
			reachable.add(edge.targetComponentId);
			changed = true;
		}
	}
	return reachable;
}

/**
 * Selects the independently buildable artifact inputs for one exposure.
 *
 * Selection stays at module granularity so native bundlers can tree-shake unused
 * exports; authored modules are not rewritten by the exposure compiler.
 */
export function selectExactExposureArtifactGraph(
	graph: ExactArtifactGraph,
	rootComponentId: string
): ExactArtifactGraph {
	const reachable = exactReachableExposureComponents(graph, rootComponentId);
	const artifacts = graph.artifacts.filter((artifact) =>
		artifact.build.componentIds.some((componentId) => reachable.has(componentId))
	);
	const selectedInputs = new Set(artifacts.map((artifact) => artifact.inputFile));
	return {
		conditions: graph.conditions,
		packageExports: Object.fromEntries(
			Object.entries(graph.packageExports).filter(([_key, value]) =>
				Object.values(value).some((file) =>
					artifacts.some(
						(artifact) =>
							artifact.clientFile === file ||
							artifact.serverFile === file ||
							artifact.sharedFile === file
					)
				)
			)
		),
		componentEdges: graph.componentEdges.filter(
			(edge) =>
				selectedInputs.has(edge.sourceFile) &&
				reachable.has(edge.sourceComponentId) &&
				(!edge.targetComponentId || reachable.has(edge.targetComponentId))
		),
		clientIslands: graph.clientIslands.filter(
			(entry) => !entry.componentId || reachable.has(entry.componentId)
		),
		serverParts: graph.serverParts.filter(
			(entry) => !entry.componentId || reachable.has(entry.componentId)
		),
		continuations: graph.continuations.filter((entry) => reachable.has(entry.componentId)),
		execution: {
			operations: graph.execution.operations.filter((entry) => reachable.has(entry.componentId)),
			boundaries: graph.execution.boundaries.filter(
				(entry) =>
					(!entry.componentId || reachable.has(entry.componentId)) &&
					(!entry.ownerComponentId || reachable.has(entry.ownerComponentId))
			)
		},
		artifacts
	};
}

/** Resolves one default-exported component root without exposing symbol analysis. */
export function exactExposureRootComponentId(
	graph: ExactArtifactGraph,
	inputFile: string
): string | undefined {
	const target = path.resolve(inputFile);
	const artifact = graph.artifacts.find(
		(candidate) => path.resolve(candidate.inputFile) === target
	);
	return artifact?.build.exposureRoots.find((root) => root.exportName === 'default')?.componentId;
}

/** Projects selected continuation and boundary analysis into executable runtime authority. */
export function createExactExposureExecutionPlan(
	graph: ExactArtifactGraph
): ExactExposureExecutionPlan {
	return Object.freeze({
		operations: graph.execution.operations,
		boundaries: graph.execution.boundaries
	});
}

/** Remaps selected client-island imports to authored modules for bundler composition. */
export function withExactAuthoredClientModules(graph: ExactArtifactGraph): ExactArtifactGraph {
	const moduleByComponent = new Map<string, string>();
	for (const artifact of graph.artifacts) {
		const authoredModule = slashPath(path.resolve(artifact.inputFile));
		for (const componentId of artifact.build.componentIds)
			moduleByComponent.set(componentId, authoredModule);
	}
	return {
		...graph,
		clientIslands: graph.clientIslands.map((entry) => ({
			...entry,
			module: entry.componentId
				? (moduleByComponent.get(entry.componentId) ?? entry.module)
				: entry.module
		})),
		artifacts: graph.artifacts.map((artifact) => ({
			...artifact,
			clientFile: slashPath(path.resolve(artifact.inputFile))
		}))
	};
}

function slashPath(value: string): string {
	return value.replaceAll(path.sep, '/');
}

/**
 * Partitions rich source inspection to components reachable from one exposure.
 *
 * The returned catalog remains a server artifact. It retains producer source
 * provenance and never absorbs unrelated components from the page host or
 * sibling exposures.
 */
export function selectExactExposureInspectionCatalog(
	graph: ExactArtifactGraph,
	rootComponentId: string,
	inspections: readonly ExactSourceInspection[]
): ExactExposureInspectionCatalog {
	const reachable = exactReachableExposureComponents(graph, rootComponentId);
	const files = inspections.flatMap((inspection) => {
		const components = inspection.components.filter((component) => reachable.has(component.id));
		return components.length
			? [
					Object.freeze({
						...inspection,
						components: Object.freeze(components)
					})
				]
			: [];
	});
	return Object.freeze({
		version: 1,
		rootComponentId,
		files: Object.freeze(files)
	});
}
