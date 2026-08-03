import type { ExactModuleAnalysis } from '../contracts/module-analysis.js';

const analyses = new WeakMap<object, ExactModuleAnalysis>();

/** Associates ephemeral analysis with an owned compiler result without publishing it as build API. */
export function retainArtifactAnalysis<T extends object>(
	result: T,
	analysis: ExactModuleAnalysis
): T {
	analyses.set(result, analysis);
	return result;
}

/** Resolves ephemeral analysis for compiler-internal validation and emission work. */
export function artifactAnalysis(result: object): ExactModuleAnalysis {
	const analysis = analyses.get(result);
	if (!analysis) throw new Error('Artifact result is not owned by this compiler session');
	return analysis;
}
