import type {
	ExactBoundaryIR,
	ExactCallableSummaryIR,
	ExactComponentIR,
	ExactExportIR,
	ExactPartitionPlanIR,
	ExactSemanticGraphIR,
	ExactSymbolIR
} from './analysis.js';
import type { ExactComponentResumptionIR, ExactContinuationIR } from './continuations.js';
import type { ExactComponentRegistryIR } from './registries.js';
import type { ExactPolicyAnalysisIR } from './policy.js';
import type {
	ExactAssetDependencyIR,
	ExactRawHtmlCapabilityIR,
	ExactRendererEnhancementIR
} from './transform.js';

/** Ephemeral analysis retained only by an owned compiler session. */
export type ExactModuleAnalysis = {
	version: 1;
	filename: string;
	dependencies: string[];
	assets: ExactAssetDependencyIR[];
	semanticGraph?: ExactSemanticGraphIR;
	/** Canonical component facts and artifact reachability; descriptive, never authorization. */
	components: ExactComponentIR[];
	exports: ExactExportIR[];
	symbols: ExactSymbolIR[];
	boundaries: ExactBoundaryIR[];
	partitionPlan: ExactPartitionPlanIR;
	callables: ExactCallableSummaryIR[];
	continuations: ExactContinuationIR[];
	registries?: ExactComponentRegistryIR[];
	/** Build-facing canonical imports used to assemble the bundle-local enhancement catalog. */
	rendererEnhancements: ExactRendererEnhancementIR[];
	resumptions: ExactComponentResumptionIR[];
	policy: ExactPolicyAnalysisIR;
	/** Package identity supplied by the build integration, not inferred as a trust decision. */
	packageName?: string;
	requiredCapabilities?: {
		rawHtml: ExactRawHtmlCapabilityIR[];
	};
	diagnostics: string[];
};
