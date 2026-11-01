import './environment-provider-files.mjs';
import * as provenance from '@exactjs/package-provenance';
import { mkdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadExactIntlCatalogFiles } from '../../../intl-build/dist/catalog-files.js';
import { verifyWideCatalogFiles } from '../wide-catalog-journey.mjs';
import { verifyPackageExportContainment } from '../package-export-journey.mjs';

const root = path.resolve(process.argv[2], 'package-exports');
try {
	await mkdir(root, { recursive: true });
	await verifyPackageExportContainment(provenance, root);
	await verifyWideCatalogFiles(loadExactIntlCatalogFiles, root);
} finally {
	await rm(root, { recursive: true, force: true });
}

const { verifyCompilerBuildValues, verifyCompilerProjectionValues } = await import(
	'../compiler-observation-journey.mjs'
);
const { createExactSourceInspection } = await import(
	'../../../compiler/dist/language-tools/source-inspection.js'
);
const { nativeModuleAnalysis } = await import('../../../compiler/dist/native/module-analysis.js');
const { createArtifactBuildProducts } = await import(
	'../../../compiler/dist/compilation/build-products.js'
);
const { createExactCompilerExplanation } = await import('../../../compiler/dist/explanation.js');
const { createExactRuntimeInspectionCorrelation } = await import(
	'../../../compiler/dist/language-tools/runtime-correlation.js'
);
const { planExactTaskRefactor } = await import(
	'../../../compiler/dist/language-tools/task-refactor.js'
);
for (const fixture of JSON.parse(await readFile(process.argv[3], 'utf8')))
	verifyCompilerProjectionValues(
		{
			createExactSourceInspection,
			nativeModuleAnalysis,
			createArtifactBuildProducts,
			createExactCompilerExplanation,
			createExactRuntimeInspectionCorrelation,
			planExactTaskRefactor
		},
		fixture
	);

const { createExactPublishedComponentBuildFacts } = await import(
	'../../../compiler/dist/component-library-build.js'
);
const { inspectExactClientArtifactIsolation } = await import(
	'../../../compiler/dist/artifact-isolation.js'
);
const { exactEnhancementFacadeRequest, parseExactEnhancementFacadeRequest } = await import(
	'../../../compiler/dist/compilation/enhancement-facades.js'
);
verifyCompilerBuildValues({
	createExactPublishedComponentBuildFacts,
	inspectExactClientArtifactIsolation,
	exactEnhancementFacadeRequest,
	parseExactEnhancementFacadeRequest
});
