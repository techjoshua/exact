export {
	assertExactClientArtifactIsolation,
	inspectExactClientArtifactIsolation,
	type ExactClientArtifactIsolationReport,
	type ExactClientArtifactIsolationViolation,
	type ExactClientArtifactOutput
} from '../artifact-isolation.js';
export { createExactCompilerExplanation } from '../explanation.js';
export {
	assertExactArtifactTarget,
	createExactArtifactComponentEdges,
	createExactArtifactGraph,
	createExactArtifactRegistryModules,
	createPackageExportMap,
	diffExactArtifactPlans,
	discoverExactPackageManifests,
	exactExportConditions,
	readExactArtifactManifestEntries,
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
	analyzeExpressionWrites,
	lowerExpressionWrites,
	type ExpressionWritePlan,
	type ExpressionWriteResult,
	type ExpressionWriteSite
} from '../expression/writes.js';
export { parseExactCompilerManifest } from '../manifest-parse.js';
export {
	exactReachableExposureComponents,
	selectExactExposureArtifactGraph
} from '../exposures.js';
export {
	rewriteModuleReferences,
	type ModuleExportReplacement,
	type ModuleRewriteOptions,
	type ModuleRewriteResult
} from '../module-rewrite.js';
export { generatedComponentName } from '../names.js';
export {
	createExactPolicyAuditReport,
	formatExactPolicyAuditReport,
	type ExactPolicyAuditReportOptions
} from '../policy-report.js';
export { preprocessPropPunning } from '../preprocess.js';
export { preprocessComponentComputations } from '../component-computation/preprocess.js';
export {
	buildExactProvenance,
	type ExactProvenanceEntry,
	type ExactProvenanceGraph,
	type ExactReactiveCell,
	type ExactReactiveProvenance
} from '../provenance.js';
export {
	createClientIslandRegistryEntries,
	createClientIslandRegistryModule,
	createExactHydrationRegistrationModule,
	createServerPartRegistryEntries,
	createServerPartRegistryModule
} from '../registry.js';
export { createLineSourceMap } from '../source-maps.js';
export type * from '../types.js';
export { exactCompilerManifestVersion } from '../versions.js';

export { compileFile, compileProject } from './file-compilation.js';
export { analyzeSemanticGraph, analyzeSource } from './source-analysis.js';
export { analyzeReactiveProvenance, transform, transformSource } from './transformation.js';

export {
	compileArtifactPlanEntries,
	compileFileArtifacts,
	compileProjectArtifacts
} from './artifact-compilation.js';
export { createExactArtifactDevState, updateExactArtifactDevState } from './dev-state.js';
export { NativeCompilerProcess } from '../native/process.js';
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
	NativeCompilerStateEffect,
	NativeCompilerTask,
	NativeCompilerRequest,
	NativeCompilerResponse,
	NativeCompilerSourceMap,
	NativeCompilerTimings
} from '../native/process-contracts.js';
export type { NativeCompilerProcessOptions } from '../native/process.js';
export { createExactArtifactPlan } from './artifact-plan.js';
