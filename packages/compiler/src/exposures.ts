import type { ExactArtifactGraph } from './contracts/artifacts.js';
import type { ExactSourceInspection } from './language-tools/contracts.js';
import path from 'node:path';

/** Server-owned source catalog scoped to one microfrontend exposure graph. */
export type ExactExposureInspectionCatalog = Readonly<{
	version: 1;
	rootComponentId: string;
	files: readonly ExactSourceInspection[];
}>;

/** Returns component ids reachable through the normalized partition plan from one explicit root. */
export function exactReachableExposureComponents(
	graph: ExactArtifactGraph,
	rootComponentId: string
): ReadonlySet<string> {
	const known = new Set([
		...graph.artifacts.flatMap((artifact) => artifact.componentIds),
		...graph.partitionPlans.flatMap((entry) =>
			entry.plan.nodes.flatMap((node) => (node.componentContract ? [node.componentContract] : []))
		)
	]);
	if (!known.has(rootComponentId))
		throw new Error(`Unknown eXact exposure root component ${rootComponentId}`);
	const adjacency = partitionComponentAdjacency(graph);
	// Keep compiler-branded cross-module render edges until every package plan is
	// linked into one native project projection.
	for (const edge of graph.componentEdges) {
		if (!edge.targetComponentId) continue;
		const targets = adjacency.get(edge.sourceComponentId) ?? new Set<string>();
		targets.add(edge.targetComponentId);
		adjacency.set(edge.sourceComponentId, targets);
	}
	const reachable = new Set([rootComponentId]);
	const pending = [rootComponentId];
	while (pending.length) {
		for (const target of adjacency.get(pending.shift()!) ?? []) {
			if (reachable.has(target)) continue;
			reachable.add(target);
			pending.push(target);
		}
	}
	return reachable;
}

function partitionComponentAdjacency(graph: ExactArtifactGraph): Map<string, Set<string>> {
	const adjacency = new Map<string, Set<string>>();
	for (const entry of graph.partitionPlans) {
		const nodes = new Map(entry.plan.nodes.map((node) => [node.id, node]));
		for (const edge of entry.plan.edges) {
			const parent = nodes.get(edge.parent);
			const child = nodes.get(edge.child);
			const owner = parent && nodes.get(parent.ownerComponent);
			const source = parent?.componentContract ?? owner?.componentContract;
			const target = child?.componentContract;
			if (!source || !target || source === target) continue;
			const targets = adjacency.get(source) ?? new Set<string>();
			targets.add(target);
			adjacency.set(source, targets);
		}
	}
	return adjacency;
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
		artifact.componentIds.some((componentId) => reachable.has(componentId))
	);
	const selectedInputs = new Set(artifacts.map((artifact) => artifact.inputFile));
	return {
		buildKey: graph.buildKey,
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
		operations: graph.operations.filter((entry) => reachable.has(entry.componentId)),
		boundaries: graph.boundaries.filter(
			(entry) =>
				(!entry.componentId || reachable.has(entry.componentId)) &&
				(!entry.ownerComponentId || reachable.has(entry.ownerComponentId))
		),
		partitionPlans: graph.partitionPlans.filter((entry) => selectedInputs.has(entry.inputFile)),
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
	return artifact?.exposureRoots.find((root) => root.exportName === 'default')?.componentId;
}

/** Remaps selected client-island imports to authored modules for bundler composition. */
export function withExactAuthoredClientModules(graph: ExactArtifactGraph): ExactArtifactGraph {
	const moduleByComponent = new Map<string, string>();
	for (const artifact of graph.artifacts) {
		const authoredModule = slashPath(path.resolve(artifact.inputFile));
		for (const componentId of artifact.componentIds)
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
