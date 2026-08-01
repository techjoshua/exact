import type { ExactJsonValue } from '@exactjs/plugin-api';
import type {
	ExactBoundaryIR,
	ExactCallableSummaryIR,
	ExactComponentIR,
	ExactContextEffect,
	ExactExportIR,
	ExactSemanticGraphIR,
	ExactStateEffect,
	ExactSymbolIR
} from './analysis.js';
import type { ExactComponentResumptionIR, ExactContinuationIR } from './continuations.js';
import type { ExactComponentRegistryIR } from './registries.js';
import type { ExactPlacement, ExactPolicyAnalysisIR } from './policy.js';
import type { ExactAssetDependencyIR, ExactRawHtmlCapabilityIR } from './transform.js';

/** Ephemeral analysis retained only by an owned compiler session. */
export type ExactModuleAnalysis = {
	version: 1;
	filename: string;
	dependencies: string[];
	assets: ExactAssetDependencyIR[];
	semanticGraph?: ExactSemanticGraphIR;
	components: ExactComponentIR[];
	exports: ExactExportIR[];
	symbols: ExactSymbolIR[];
	boundaries: ExactBoundaryIR[];
	callables: ExactCallableSummaryIR[];
	continuations: ExactContinuationIR[];
	registries?: ExactComponentRegistryIR[];
	resumptions: ExactComponentResumptionIR[];
	policy: ExactPolicyAnalysisIR;
	packageName?: string;
	requiredCapabilities?: {
		rawHtml: ExactRawHtmlCapabilityIR[];
	};
	serverActions: Record<
		string,
		{
			id: string;
			componentId: string;
			taskId: string;
			placement: ExactPlacement;
			stateContract: {
				reads: ExactStateEffect[];
				writes: ExactStateEffect[];
			};
			serverContextContract: ExactContextEffect[];
			publicContextContract: ExactContextEffect[];
		}
	>;
	pluginRegistry?: {
		fingerprint: string;
		plugins: Record<
			string,
			{
				version: string;
				protocolVersion: string;
				required: boolean;
				compilerConfigKey: ExactJsonValue;
			}
		>;
	};
	pluginData?: Record<string, ExactJsonValue>;
	diagnostics: string[];
};
