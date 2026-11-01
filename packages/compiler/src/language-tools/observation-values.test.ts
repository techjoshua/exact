import { createExactPublishedComponentBuildFacts } from '../component-library-build.js';
import {
	exactEnhancementFacadeRequest,
	parseExactEnhancementFacadeRequest
} from '../adapter-support.js';
import { it } from 'vitest';
import path from 'node:path';
import { createExactSourceInspection } from './source-inspection.js';
import { nativeModuleAnalysis } from '../native/module-analysis.js';
import { createArtifactBuildProducts } from '../compilation/build-products.js';
import { createExactCompilerExplanation } from '../explanation.js';
import { planExactTaskRefactor } from './task-refactor.js';
import {
	createCompilerSession,
	inspectExactClientArtifactIsolation,
	createExactLanguageService,
	NativeCompilerLanguageClient,
	createExactBuildInspectionCatalog,
	createExactRuntimeInspectionCorrelation,
	type ExactCompilerSessionStats,
	type ExactCompilerInvalidation,
	type ExactSourceInspection
} from '../index.js';
import {
	compilerObservationSource,
	verifyCompilerSessionValues,
	verifyCompilerBuildValues,
	verifyCompilerServiceValues,
	verifyCompilerProjectionValues
} from '../../../component-composition-corpus/test-support/compiler-observation-journey.mjs';
it('keeps ordinary editor observations separate from retained compiler facts', () =>
	verifyCompilerServiceValues(
		{
			createExactLanguageService,
			createExactBuildInspectionCatalog,
			createExactRuntimeInspectionCorrelation
		},
		process.cwd()
	));

it('keeps artifact, editor, and refactor projections separate from native inputs', async () => {
	const client = new NativeCompilerLanguageClient();
	try {
		const filename = path.resolve('.tmp/framework-confidence/CompilerProjection.tsx');
		const response = await client.request({
			id: filename,
			kind: 'analyze',
			source: compilerObservationSource,
			root: process.cwd(),
			diagnostics: 'semantic'
		});
		verifyCompilerProjectionValues(
			{
				createExactSourceInspection,
				nativeModuleAnalysis,
				createArtifactBuildProducts,
				createExactCompilerExplanation,
				createExactRuntimeInspectionCorrelation,
				planExactTaskRefactor
			},
			{ filename, source: compilerObservationSource, response }
		);
	} finally {
		await client.dispose();
	}
});

/** Compile-only controls keep the public inspection contract readonly. */
function readonlyInspection(value: ExactSourceInspection) {
	// @ts-expect-error Inspection generation remains readonly in TypeScript.
	value.generation = 0;
	// @ts-expect-error Inspection component lists remain readonly in TypeScript.
	value.components.push(value.components[0]!);
}
void readonlyInspection;

it('keeps session and build observations ordinary while retaining their owners', () => {
	verifyCompilerSessionValues({ createCompilerSession });
	verifyCompilerBuildValues({
		createExactPublishedComponentBuildFacts,
		inspectExactClientArtifactIsolation,
		exactEnhancementFacadeRequest,
		parseExactEnhancementFacadeRequest
	});
});

/** Compile-only controls retain readonly session observations. */
function readonlySession(
	stats: ExactCompilerSessionStats,
	invalidation: ExactCompilerInvalidation
) {
	// @ts-expect-error Statistics remain readonly in TypeScript.
	stats.modules = 1;
	// @ts-expect-error Invalidation lists remain readonly in TypeScript.
	invalidation.affectedFiles.push('changed.ts');
}
void readonlySession;
