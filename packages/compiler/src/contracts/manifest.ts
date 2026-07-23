import type { ExactJsonValue } from '@exactjs/plugin-api';
import type {
	ExactArtifactExportIR,
	ExactBoundaryIR,
	ExactCallableSummaryIR,
	ExactComponentIR,
	ExactContextEffect,
	ExactExportIR,
	ExactSemanticGraphIR,
	ExactStateEffect,
	ExactSymbolIR
} from './analysis.js';
import type { ExactPlacement, ExactPolicyManifestIR } from './policy.js';
import type { ExactAssetDependencyIR, ExactRawHtmlCapabilityIR } from './transform.js';

/** Defines the exact artifact manifest type contract. */
export type ExactArtifactManifest = {
	source: string;
	client: string;
	server: string;
	shared?: string;
	manifest: string;
	targets: {
		client: 'client';
		server: 'server';
		shared?: 'shared';
	};
	exports: ExactArtifactExportIR[];
	symbols: ExactSymbolIR[];
	boundaries: ExactBoundaryIR[];
};

/** Defines the exact compiler manifest type contract. */
export type ExactCompilerManifest = {
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
	policy: ExactPolicyManifestIR;
	packageName?: string;
	requiredCapabilities?: {
		rawHtml: ExactRawHtmlCapabilityIR[];
	};
	artifacts?: ExactArtifactManifest;
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
			contextContract: ExactContextEffect[];
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
