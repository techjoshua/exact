/** Compiler-internal APIs for framework packages and acceptance tooling. */
export { analyzeSource } from './compilation/source-analysis.js';
export { createExactCompilerExplanation } from './explanation.js';
export { createExactInspectionRedactions } from './language-tools/build-catalog.js';
export {
	createExactPolicyAuditReport,
	formatExactPolicyAuditReport,
	type ExactPolicyAuditReportOptions
} from './policy-report.js';
