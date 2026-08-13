import { recordWebpackComponentBuildFacts, recordWebpackInspectionModule } from './sessions.js';
import type { ExactWebpackPluginOptions } from './plugin.js';
import type { ExactWebpackTransformResult } from './transform.js';

/** Publishes compiler and inspection facts produced by one webpack loader transform. */
export function recordWebpackTransformResult(
	options: ExactWebpackPluginOptions,
	filename: string,
	source: string,
	result: ExactWebpackTransformResult
): void {
	if (result.componentBuild)
		recordWebpackComponentBuildFacts(
			options.__exactSessionId,
			filename,
			source,
			result.componentBuild
		);
	if (result.inspection)
		recordWebpackInspectionModule(options.__exactSessionId, filename, source, result.inspection);
}
