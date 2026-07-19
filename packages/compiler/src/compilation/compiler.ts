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
export {
	analyzeReactiveProvenance,
	analyzeSemanticGraph,
	analyzeSource,
	transform,
	transformSource
} from './source-analysis.js';

export {
	compileArtifactPlanEntries,
	compileFileArtifacts,
	compileProjectArtifacts
} from './artifact-compilation.js';
export { createExactArtifactDevState, updateExactArtifactDevState } from './dev-state.js';
export { createExactArtifactPlan } from './artifact-plan.js';
