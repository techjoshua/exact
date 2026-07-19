export interface ReactCompatibilityBuildInput {
	readonly id: string;
	readonly source: string;
	readonly format: 'module' | 'commonjs';
	readonly target: 'client' | 'server';
	readonly sourceMap?: boolean;
}

export interface ReactCompatibilityDiagnostic {
	readonly severity: 'info' | 'warning' | 'error';
	readonly code:
		| 'dynamic-export-escape'
		| 'unsupported-commonjs'
		| 'compatibility-retained'
		| 'unsupported-version'
		| 'unsupported-export';
	readonly message: string;
	readonly moduleId: string;
	readonly sourceModule: string;
	readonly sourceExport: string;
	readonly sourceVersion: string;
	readonly adapterPackage: string;
	readonly adapterVersion: string;
	readonly replacementExport: string;
	readonly buildRoot: string;
}

export interface ReactCompatibilityTransformResult {
	readonly code: string;
	readonly map: unknown;
	readonly changed: boolean;
	readonly watchFiles: readonly string[];
	readonly dependencyIds: readonly string[];
	readonly diagnostics: readonly ReactCompatibilityDiagnostic[];
	readonly registryHash: string;
}

export interface ReactCompatibilityReport {
	readonly buildRoot: string;
	readonly target: 18 | 19;
	readonly registryHash: string;
	readonly activeAdapters: readonly string[];
	readonly ignoredAdapters: readonly string[];
	readonly unusedAdapters: readonly string[];
	readonly substitutions: readonly Readonly<{
		sourceModule: string;
		sourceExport: string;
		sourceVersion: string;
		adapterPackage: string;
		adapterVersion: string;
		targetModule: string;
		targetExport: string;
	}>[];
	/** Importer-specific decisions observed while transforming application modules. */
	readonly selections: readonly ReactCompatibilitySelection[];
	readonly unsupportedVersions: readonly Readonly<{
		sourceModule: string;
		sourceLocation: string;
		installedVersion: string;
		supportedRanges: readonly string[];
		adapterPackage: string;
		adapterVersion: string;
	}>[];
	readonly watchFiles: readonly string[];
}

export interface ReactCompatibilitySelection {
	readonly importer: string;
	readonly status: 'substituted' | 'rejected';
	readonly sourceModule: string;
	readonly sourceExport: string;
	readonly sourceLocation: string;
	readonly installedVersion: string;
	readonly adapterPackage: string;
	readonly adapterVersion: string;
	readonly targetModule?: string;
	readonly targetExport?: string;
	readonly reason?: 'unsupported-export' | 'unsupported-version';
}

export interface ReactCompatibilityBuildEngine {
	readonly resolved: ResolvedReactCompatibility;
	readonly rewriteOptions: ModuleRewriteOptions;
	readonly watchFiles: readonly string[];
	readonly registryHash: string;
	transformModule(input: ReactCompatibilityBuildInput): ReactCompatibilityTransformResult;
	invalidate(file: string): void;
	report(): ReactCompatibilityReport;
}
import type { ModuleRewriteOptions } from '@exact/expressions';
import type { ResolvedReactCompatibility } from '../plugin.js';
