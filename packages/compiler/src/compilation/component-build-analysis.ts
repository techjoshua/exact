import type { ExactComponentBuildFacts, TransformOptions } from '../types.js';
import { createExactComponentBuildFacts } from './component-build-facts.js';
import { analyzeSource } from './source-analysis.js';

/**
 * Returns protocol component facts without emitting or validating executable JavaScript.
 * Build preflight callers receive descriptive metadata even when a test harness owns module effects.
 */
export function inspectExactComponentBuildFacts(
	source: string,
	options: TransformOptions = {}
): ExactComponentBuildFacts {
	return createExactComponentBuildFacts(analyzeSource(source, options));
}
