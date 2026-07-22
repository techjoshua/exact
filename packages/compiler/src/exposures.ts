import type { ExactArtifactGraph } from './contracts/artifacts.js';

/** Returns component ids reachable through authored render edges from one explicit root. */
export function exactReachableExposureComponents(
	graph: ExactArtifactGraph,
	rootComponentId: string
): ReadonlySet<string> {
	const known = new Set(
		graph.artifacts.flatMap((artifact) =>
			artifact.manifest.components.map((component) => component.id)
		)
	);
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
		artifact.manifest.components.some((component) => reachable.has(component.id))
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
		artifacts
	};
}
