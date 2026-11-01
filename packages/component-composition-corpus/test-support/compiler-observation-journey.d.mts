/** Owned component source used by native and editor observation acceptance. */
export const compilerObservationSource: string;
/** Checks public editor observations and retained generation ownership with an owned native process. */
export function verifyCompilerServiceValues(
	api: Pick<
		typeof import('../../compiler/src/index.js'),
		| 'createExactLanguageService'
		| 'createExactBuildInspectionCatalog'
		| 'createExactRuntimeInspectionCorrelation'
	>,
	root: string
): Promise<void>;
/** Checks data-only projections from a captured actual native response. */
export function verifyCompilerProjectionValues(
	api: {
		createExactSourceInspection: typeof import('../../compiler/src/language-tools/source-inspection.js').createExactSourceInspection;
		nativeModuleAnalysis: typeof import('../../compiler/src/native/module-analysis.js').nativeModuleAnalysis;
		createArtifactBuildProducts: typeof import('../../compiler/src/compilation/build-products.js').createArtifactBuildProducts;
		createExactCompilerExplanation: typeof import('../../compiler/src/explanation.js').createExactCompilerExplanation;
		createExactRuntimeInspectionCorrelation: typeof import('../../compiler/src/language-tools/runtime-correlation.js').createExactRuntimeInspectionCorrelation;
		planExactTaskRefactor: typeof import('../../compiler/src/language-tools/task-refactor.js').planExactTaskRefactor;
	},
	fixture: {
		filename: string;
		source: string;
		response: import('../../compiler/src/native/process-contracts.js').NativeCompilerResponse;
	}
): void;
/** Checks caller-owned session observations and disposal. Requires a native compiler host. */
export function verifyCompilerSessionValues(
	api: Pick<typeof import('../../compiler/src/index.js'), 'createCompilerSession'>
): void;
/** Checks build observations while retaining source inputs and validation decisions. */
export function verifyCompilerBuildValues(api: {
	createExactPublishedComponentBuildFacts: typeof import('../../compiler/src/component-library-build.js').createExactPublishedComponentBuildFacts;
	inspectExactClientArtifactIsolation: typeof import('../../compiler/src/index.js').inspectExactClientArtifactIsolation;
	exactEnhancementFacadeRequest: typeof import('../../compiler/src/adapter-support.js').exactEnhancementFacadeRequest;
	parseExactEnhancementFacadeRequest: typeof import('../../compiler/src/adapter-support.js').parseExactEnhancementFacadeRequest;
}): void;
