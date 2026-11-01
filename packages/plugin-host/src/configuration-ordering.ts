import type { ExactConfigurationContributor, ExactPluginDiscoveryResult } from './discovery.js';
import { packageName } from './graph.js';

/** Dependency-first execution batches and canonical contributor provenance for one plugin. */
export interface ConfigurationContributorPlan {
	readonly ordered: readonly ExactConfigurationContributor[];
	readonly orderingAfter: ReadonlyMap<string, readonly string[]>;
}

/**
 * Plans contributor execution and provenance from one reachability walk per contributor.
 * Ready contributors execute in sorted batches, preserving deterministic ordering across ties.
 * Noncontributing intermediates remain traversable. Cycles reject before transforms begin.
 */
export function planConfigurationContributors(
	discovery: Pick<ExactPluginDiscoveryResult, 'participantEdges'>,
	contributors: readonly ExactConfigurationContributor[]
): ConfigurationContributorPlan {
	const byId = new Map(contributors.map((value) => [value.node.id, value]));
	const dependencies = new Map(
		[...byId.keys()].map((id) => [id, contributorDescendants(discovery, id, byId)])
	);
	const waiting = new Map([...dependencies].map(([id, values]) => [id, values.length]));
	const dependants = new Map<string, string[]>();
	for (const [id, values] of dependencies) {
		for (const dependency of values) {
			const parents = dependants.get(dependency) ?? [];
			parents.push(id);
			dependants.set(dependency, parents);
		}
	}
	const sort = (ids: string[]) =>
		ids.sort((left, right) =>
			packageName(byId.get(left)!.node).localeCompare(packageName(byId.get(right)!.node))
		);
	let ready = sort([...waiting].filter(([, count]) => count === 0).map(([id]) => id));
	const ordered: ExactConfigurationContributor[] = [];
	while (ready.length) {
		const next: string[] = [];
		for (const id of ready) {
			ordered.push(byId.get(id)!);
			waiting.delete(id);
			for (const parent of dependants.get(id) ?? []) {
				const count = waiting.get(parent)! - 1;
				waiting.set(parent, count);
				if (count === 0) next.push(parent);
			}
		}
		ready = sort(next);
	}
	if (waiting.size)
		throw new Error(
			`Plugin configuration contributor graph contains a cycle: ${[...waiting.keys()].map((id) => packageName(byId.get(id)!.node)).join(', ')}`
		);
	return {
		ordered,
		orderingAfter: new Map(
			[...dependencies].map(([id, values]) => [
				id,
				values.map((dependency) => packageName(byId.get(dependency)!.node)).sort()
			])
		)
	};
}

/** Traverses package edges without shifting the queue or repeatedly visiting shared descendants. */
function contributorDescendants(
	discovery: Pick<ExactPluginDiscoveryResult, 'participantEdges'>,
	id: string,
	contributors: ReadonlyMap<string, ExactConfigurationContributor>
): string[] {
	const result = new Set<string>();
	const seen = new Set<string>();
	const pending = [...(discovery.participantEdges.get(id) ?? [])];
	for (let cursor = 0; cursor < pending.length; cursor++) {
		const child = pending[cursor]!;
		if (seen.has(child)) continue;
		seen.add(child);
		if (contributors.has(child)) result.add(child);
		for (const descendant of discovery.participantEdges.get(child) ?? []) pending.push(descendant);
	}
	return [...result];
}
