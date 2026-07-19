import type { ExactArtifactTarget } from '../types.js';
import { effectFor, targetsFor } from './effect-lattice.js';
import { orderStronglyConnectedComponents } from './strongly-connected-components.js';

import type { MutableCallable } from './callable-state.js';
function targetsForCallable(callable: MutableCallable): ExactArtifactTarget[] {
	const effect = effectFor(callable.sources);
	if (effect !== 'unknown') return targetsFor(effect);
	const browser = callable.sources.some((source) => source.environment === 'browser');
	const server = callable.sources.some((source) => source.environment === 'server');
	return browser === server ? [] : browser ? ['client'] : ['server'];
}

export function allowedTargetsForCallable(callable: MutableCallable): ExactArtifactTarget[] {
	const effect = effectFor(callable.sources);
	if (effect !== 'unknown') return targetsFor(effect);
	const browser = callable.sources.some((source) => source.environment === 'browser');
	const server = callable.sources.some((source) => source.environment === 'server');
	if (browser && server) return [];
	if (browser) return ['client'];
	if (server) return ['server'];
	return ['client', 'server'];
}

export function callableSccOrder(callables: readonly MutableCallable[]): MutableCallable[][] {
	return orderStronglyConnectedComponents(
		callables,
		(callable) => callable.id,
		(callable) => callable.calls.flatMap((edge) => (edge.targetId ? [edge.targetId] : []))
	);
}

export function callableArtifactTargets(
	callables: readonly MutableCallable[]
): Map<string, Set<ExactArtifactTarget>> {
	const result = new Map<string, Set<ExactArtifactTarget>>();
	for (const callable of callables) {
		const effect = effectFor(callable.sources);
		const seeds = new Set<ExactArtifactTarget>(callable.seedTargets);
		if (callable.executable) for (const target of targetsForCallable(callable)) seeds.add(target);
		if (callable.exportNames.length)
			for (const target of targetsForCallable(callable)) seeds.add(target);
		if (callable.kind === 'task') {
			if (effect === 'neutral') {
				if (callable.writes.length) {
					seeds.add('client');
					seeds.add('server');
				} else seeds.add('client');
			} else for (const target of targetsForCallable(callable)) seeds.add(target);
		}
		result.set(callable.id, seeds);
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const caller of callables)
			for (const edge of caller.calls) {
				if (!edge.targetId) continue;
				const callee = callables.find((candidate) => candidate.id === edge.targetId);
				if (!callee) continue;
				const allowed = new Set(allowedTargetsForCallable(callee));
				const targets = result.get(edge.targetId)!;
				for (const target of result.get(caller.id) ?? [])
					if (allowed.has(target) && !targets.has(target)) {
						targets.add(target);
						changed = true;
					}
			}
	}
	return result;
}
