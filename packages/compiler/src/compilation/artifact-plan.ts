import { artifactPathsFor, collectInputFiles, commonRoot } from '../paths.js';
import type { ExactArtifactPlan, ExactArtifactPlanOptions } from '../types.js';

/** Creates deterministic client/server artifact output paths for a set of inputs. */
export async function createExactArtifactPlan(
	inputs: readonly string[],
	options: ExactArtifactPlanOptions
): Promise<ExactArtifactPlan> {
	const files = await collectInputFiles(inputs);
	const rootDir = options.rootDir ?? commonRoot(files);
	return {
		rootDir,
		entries: files.map((inputFile) => ({
			inputFile,
			...artifactPathsFor(inputFile, options.outDir, rootDir)
		}))
	};
}
