import type { ExactPublishedModuleArtifacts, TransformOptions } from '../contracts/transform.js';
import { analyzeSource } from '../compilation/source-analysis.js';
import { createArtifactBuildProducts } from '../compilation/build-products.js';
import path from 'node:path';
import type { ExactCompilerSession } from '../expression/project.js';

/** Projects library-owned registration metadata without executing source or specializing for a consumer. */
export function libraryArtifactProducts(
	source: string,
	filename: string,
	packageRoot: string,
	project: string,
	clientModule: string,
	serverModule: string,
	analysisOptions: Readonly<
		Pick<TransformOptions, 'packageEnhancements'> & { session: ExactCompilerSession }
	>
): ExactPublishedModuleArtifacts | undefined {
	const analysis = analyzeSource(source, {
		...analysisOptions,
		filename,
		root: packageRoot,
		configFile: path.resolve(packageRoot, project),
		serverComponents: false
	});
	const products = createArtifactBuildProducts(filename, analysis);
	if (
		!products.clientRegistrations.length &&
		!products.serverRegistrations.length &&
		!products.operations.length
	)
		return undefined;
	return {
		clientModule,
		serverModule,
		build: {
			clientRegistrations: products.clientRegistrations,
			serverRegistrations: products.serverRegistrations,
			operations: products.operations,
			boundaries: products.boundaries,
			exposureRoots: products.exposureRoots
		}
	};
}
