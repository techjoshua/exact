import type { ExactCallableSummaryIR } from '../types.js';

/** Reports whether exact callable summary. */
export function isExactCallableSummary(value: unknown): value is ExactCallableSummaryIR {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const summary = value as Partial<ExactCallableSummaryIR>;
	const effects = new Set(['neutral', 'browser', 'server', 'mixed', 'unknown']);
	return (
		typeof summary.id === 'string' &&
		typeof summary.name === 'string' &&
		['function', 'method', 'component', 'task', 'initializer', 'module-initializer'].includes(
			summary.kind ?? ''
		) &&
		Array.isArray(summary.exportNames) &&
		summary.exportNames.every((name) => typeof name === 'string') &&
		effects.has(summary.directEffect ?? '') &&
		effects.has(summary.effect ?? '') &&
		Array.isArray(summary.directEffectSources) &&
		summary.directEffectSources.every(isExactEffectSource) &&
		Array.isArray(summary.effectSources) &&
		summary.effectSources.every(isExactEffectSource) &&
		Array.isArray(summary.calls) &&
		summary.calls.every(isExactCallEdge) &&
		Array.isArray(summary.artifactTargets) &&
		summary.artifactTargets.every((target) => target === 'client' || target === 'server') &&
		new Set(summary.artifactTargets).size === summary.artifactTargets.length &&
		Array.isArray(summary.stateReads) &&
		summary.stateReads.every(isExactStateEffect) &&
		Array.isArray(summary.stateWrites) &&
		summary.stateWrites.every(isExactStateEffect) &&
		Array.isArray(summary.contexts) &&
		summary.contexts.every(isExactContextEffect) &&
		(summary.reevaluationSafe === undefined || typeof summary.reevaluationSafe === 'boolean')
	);
}

function isExactStateEffect(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const effect = value as Record<string, unknown>;
	const receiver = effect.receiver as Record<string, unknown> | undefined;
	return (
		typeof effect.path === 'string' &&
		(effect.kind === 'read' || effect.kind === 'write') &&
		['exact', 'broad', 'unknown'].includes(String(effect.confidence)) &&
		(receiver === undefined ||
			receiver.kind === 'component' ||
			receiver.kind === 'unknown' ||
			(receiver.kind === 'parameter' &&
				Number.isInteger(receiver.index) &&
				(receiver.index as number) >= 0))
	);
}

function isExactContextEffect(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const effect = value as Record<string, unknown>;
	return (
		typeof effect.token === 'string' &&
		(effect.kind === 'read' || effect.kind === 'write') &&
		(effect.confidence === 'exact' || effect.confidence === 'unknown')
	);
}

function isExactEffectSource(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const source = value as Record<string, unknown>;
	return (
		(source.environment === 'browser' ||
			source.environment === 'server' ||
			source.environment === 'unknown') &&
		typeof source.description === 'string' &&
		Array.isArray(source.path) &&
		source.path.every((part) => typeof part === 'string')
	);
}

function isExactCallEdge(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const edge = value as Record<string, unknown>;
	return (
		typeof edge.id === 'string' &&
		typeof edge.name === 'string' &&
		typeof edge.resolved === 'boolean' &&
		(edge.targetId === undefined || typeof edge.targetId === 'string') &&
		(edge.moduleSpecifier === undefined || typeof edge.moduleSpecifier === 'string') &&
		(edge.exportName === undefined || typeof edge.exportName === 'string') &&
		(edge.receiverBindings === undefined ||
			(Array.isArray(edge.receiverBindings) &&
				edge.receiverBindings.every((binding) => {
					if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return false;
					const record = binding as Record<string, unknown>;
					return (
						Number.isInteger(record.parameterIndex) &&
						(record.parameterIndex as number) >= 0 &&
						(record.source === 'component' ||
							record.source === 'unknown' ||
							(record.source === 'parameter' &&
								Number.isInteger(record.sourceParameterIndex) &&
								(record.sourceParameterIndex as number) >= 0))
					);
				})))
	);
}

/** Returns whether a value has the artifact metadata shape embedded in compiler manifests. */
