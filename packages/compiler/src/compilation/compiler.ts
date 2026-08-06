export {
	assertExactClientArtifactIsolation,
	inspectExactClientArtifactIsolation,
	type ExactClientArtifactIsolationReport,
	type ExactClientArtifactIsolationViolation,
	type ExactClientArtifactOutput
} from '../artifact-isolation.js';
export {
	assertExactArtifactTarget,
	createExactArtifactComponentEdges,
	createExactArtifactGraph,
	createPackageExportMap,
	diffExactArtifactPlans,
	exactExportConditions,
	resolveExactArtifactImport
} from '../artifacts.js';
export { ExactCompilerSession } from '../expression/project.js';
export type {
	ExactCompilerInvalidation,
	ExactCompilerProfileEvent,
	ExactCompilerSessionOptions,
	ExactCompilerSessionStats
} from '../expression/session-contracts.js';
export {
	clearExpressionProjectCache,
	createCompilerSession,
	invalidateExpressionModule
} from '../expression/session.js';
export {
	exactReachableExposureComponents,
	exactExposureRootComponentId,
	selectExactExposureInspectionCatalog,
	selectExactExposureArtifactGraph,
	withExactAuthoredClientModules
} from '../exposures.js';
export type { ExactExposureInspectionCatalog } from '../exposures.js';
export {
	createExactBuildInspectionCatalog,
	createExactInspectionBuildKey,
	exactInspectionSourceHash,
	type ExactBuildInspectionCatalogOptions,
	type ExactBuildInspectionRootInput
} from '../language-tools/build-catalog.js';
export { createExactRuntimeInspectionCorrelation } from '../language-tools/runtime-correlation.js';
export { generatedComponentName } from '../names.js';
export { createExactHydrationRegistrationModule } from '../registry.js';
export { createLineSourceMap } from '../source-maps.js';
export type * from '../types.js';

export { compileFile, compileProject } from './file-compilation.js';
export { transform, transformSource } from './transformation.js';
export { inspectExactComponentBuildFacts } from './component-build-analysis.js';

export {
	compileArtifactPlanEntries,
	compileFileArtifacts,
	compileProjectArtifacts
} from './artifact-compilation.js';
export { createExactArtifactDevState, updateExactArtifactDevState } from './dev-state.js';
export { NativeCompilerProcess } from '../native/process.js';
export {
	NativeCompilerLanguageClient,
	type ExactNativeLanguageClient,
	type ExactNativeLanguageClientOptions
} from '../native/async-language-client.js';
export {
	nativeCompilerPlatformPackage,
	resolveNativeCompilerExecutable
} from '../native/executable.js';
export { nativeCompilerProtocolVersion } from '../native/process-contracts.js';
export type {
	NativeCompilerAnalysis,
	NativeCompilerComponent,
	NativeCompilerDiagnostic,
	NativeCompilerImport,
	NativeCompilerJSXAttribute,
	NativeCompilerJSXElement,
	NativeCompilerReactiveBinding,
	NativeCompilerStateAlias,
	NativeCompilerStateRead,
	NativeCompilerStateWrite,
	NativeCompilerValueBinding,
	NativeCompilerStateEffect,
	NativeCompilerTask,
	NativeCompilerRequest,
	NativeCompilerResponse,
	NativeCompilerSourceMap,
	NativeCompilerTimings
} from '../native/process-contracts.js';
export type { NativeCompilerProcessOptions } from '../native/process.js';
export { createExactArtifactPlan } from './artifact-plan.js';
export {
	createExactLanguageService,
	ExactCompilerLanguageService,
	type ExactLanguageServiceHostOptions
} from '../language-tools/service.js';
export type * from '../language-tools/contracts.js';
