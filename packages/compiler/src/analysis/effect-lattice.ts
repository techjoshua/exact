import type {
	ExactArtifactTarget,
	ExactEnvironmentEffect,
	ExactEnvironmentEffectSourceIR
} from '../types.js';

/**
 * Collapses individual environment requirements into a callable's effective placement.
 *
 * Unknown dominates a single known environment because unresolved execution can
 * introduce requirements that are not visible to the compiler.
 */
export function effectFor(
	sources: readonly ExactEnvironmentEffectSourceIR[]
): ExactEnvironmentEffect {
	const environments = new Set(sources.map((candidate) => candidate.environment));
	if (environments.has('browser') && environments.has('server')) return 'mixed';
	if (environments.has('unknown')) return 'unknown';
	if (environments.has('browser')) return 'browser';
	if (environments.has('server')) return 'server';
	return 'neutral';
}

/** Returns the artifact targets that can satisfy a fully known environment effect. */
export function targetsFor(effect: ExactEnvironmentEffect): ExactArtifactTarget[] {
	if (effect === 'browser') return ['client'];
	if (effect === 'server') return ['server'];
	if (effect === 'neutral') return ['client', 'server'];
	return [];
}
