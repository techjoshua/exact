import type {
	ExactCallableSummaryIR,
	ExactEnvironmentEffect,
	ExactEnvironmentEffectSourceIR
} from '../types.js';
import { effectFor } from './effect-lattice.js';

import type { CallableEffectPlan } from './callable-effects.js';
import {
	mapStateEffects,
	uniqueContextEffects,
	uniqueStateEffects
} from './callable-state-effects.js';
import type { CallableAnalysisState } from './callable-state.js';
import { callableArtifactTargets, callableSccOrder } from './callable-targets.js';
import { externalKey, prepend, sourceSignature, uniqueSources } from './effect-sources.js';

export function resolveCallableEffects(state: CallableAnalysisState): CallableEffectPlan {
	const { mutable, external, callNodeIds } = state;
	// Resolve callee SCCs before callers, then run a monotone fixed point only
	// inside each recursive component. Source order cannot affect the result.
	const mutableById = new Map(mutable.map((summary) => [summary.id, summary]));
	for (const component of callableSccOrder(mutable)) {
		let changed = true;
		while (changed) {
			changed = false;
			for (const summary of component) {
				const next = [...summary.directSources];
				for (const edge of summary.calls) {
					if (!edge.targetId) continue;
					const target = mutableById.get(edge.targetId);
					if (target)
						for (const effectSource of target.sources)
							next.push(prepend(effectSource, summary.name));
				}
				const unique = uniqueSources(next);
				if (sourceSignature(unique) !== sourceSignature(summary.sources)) {
					summary.sources = unique;
					changed = true;
				}
				const nextWrites = [...summary.directWrites];
				for (const edge of summary.calls) {
					const target = edge.targetId ? mutableById.get(edge.targetId) : undefined;
					if (target) nextWrites.push(...mapStateEffects(target.writes, edge));
				}
				const writes = uniqueStateEffects(nextWrites);
				if (JSON.stringify(writes) !== JSON.stringify(summary.writes)) {
					summary.writes = writes;
					changed = true;
				}
				const nextReads = [...summary.directReads];
				const nextContexts = [...summary.directContexts];
				for (const edge of summary.calls) {
					const target = edge.targetId ? mutableById.get(edge.targetId) : undefined;
					if (target) {
						nextReads.push(...mapStateEffects(target.reads, edge));
						nextContexts.push(...target.contexts);
					}
				}
				const reads = uniqueStateEffects(nextReads);
				const contexts = uniqueContextEffects(nextContexts);
				if (JSON.stringify(reads) !== JSON.stringify(summary.reads)) {
					summary.reads = reads;
					changed = true;
				}
				if (JSON.stringify(contexts) !== JSON.stringify(summary.contexts)) {
					summary.contexts = contexts;
					changed = true;
				}
			}
		}
	}

	const targetSets = callableArtifactTargets(mutable);
	const callables = mutable
		.map((summary) =>
			Object.freeze({
				id: summary.id,
				name: summary.name,
				kind: summary.kind,
				exportNames: [...summary.exportNames].sort(),
				directEffect: effectFor(summary.directSources),
				effect: effectFor(summary.sources),
				directEffectSources: summary.directSources,
				effectSources: summary.sources,
				calls: [...summary.calls].sort((left, right) => left.id.localeCompare(right.id)),
				artifactTargets: [...(targetSets.get(summary.id) ?? [])].sort(),
				stateReads: summary.reads,
				stateWrites: summary.writes,
				contexts: summary.contexts
			} satisfies ExactCallableSummaryIR)
		)
		.sort((left, right) => left.id.localeCompare(right.id));
	const byNodeId = new Map<string, ExactCallableSummaryIR>();
	for (const summary of mutable)
		byNodeId.set(summary.nodeId, callables.find((candidate) => candidate.id === summary.id)!);
	const byId = new Map(callables.map((summary) => [summary.id, summary]));
	const callEffects = new Map<
		string,
		Readonly<{ effect: ExactEnvironmentEffect; sources: readonly ExactEnvironmentEffectSourceIR[] }>
	>();
	for (const summary of mutable)
		for (const edge of summary.calls) {
			const target = edge.targetId ? byId.get(edge.targetId) : undefined;
			const imported =
				edge.moduleSpecifier && edge.exportName
					? external.get(externalKey(edge.moduleSpecifier, edge.exportName))
					: undefined;
			const resolved = target ?? imported;
			const callNodeId = callNodeIds.get(edge.id);
			if (resolved && callNodeId)
				callEffects.set(
					callNodeId,
					Object.freeze({ effect: resolved.effect, sources: resolved.effectSources })
				);
		}
	return Object.freeze({ callables: Object.freeze(callables), byNodeId, callEffects });
}
