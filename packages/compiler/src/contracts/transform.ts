import type { ModuleRewriteOptions } from '@exactjs/expressions';
import type { ExactPreparedCompilerRegistry } from '@exactjs/plugin-api';
import type { ExactCompilerSession } from '../expression/project.js';
import type { ExactArtifactTarget } from './artifacts.js';
import type { ExactCompilerManifest } from './manifest.js';

/** Configures transform. */
export type TransformOptions = {
	filename?: string;
	/** Root used to resolve relative filenames; defaults to the nearest package.json from cwd. */
	root?: string;
	/** Owned incremental compiler state; direct callers use the process-default session when omitted. */
	session?: ExactCompilerSession;
	target?: TransformTarget;
	importedManifests?: readonly ExactCompilerManifest[];
	serverComponents?: boolean;
	/**
	 * Preserves function-declaration hoisting while attaching component descriptors.
	 * Project artifact compilation enables this automatically for import cycles.
	 */
	preserveComponentHoisting?: boolean;
	sourceMap?: boolean;
	moduleRewrite?: ModuleRewriteOptions;
	moduleTransform?: ModuleTransform;
	/** Serializable rules for imports handled as build assets. */
	assetRules?: readonly ExactAssetRule[];
	/** Keeps client asset edges for a host bundler to consume during server builds. */
	preserveClientAssetImports?: boolean;
	/** Prepared, compiler-safe plugin projection. Raw plugin configuration is never accepted here. */
	pluginRegistry?: ExactPreparedCompilerRegistry;
	/**
	 * Generated output is syntax-checked in the transform hot path by default.
	 * Release checks can request a second full semantic binding.
	 */
	generatedValidation?: 'syntax' | 'semantic';
	/** Identifies whether this compilation is a deployable application or a publishable library. */
	packageType?: 'application' | 'library';
	/** Stable package identity used for capability requirements and package permissions. */
	packageName?: string;
	/** Application-owner capability policy. Libraries emit requirements without applying permissions. */
	capabilityPolicy?: {
		unsafeHtml?: {
			enabled: boolean;
			grants?: readonly string[];
		};
		secrets?: {
			/** Dependency packages that application code may pass secret-qualified values to. */
			allowPackages?: readonly string[];
		};
	};
};

/** Host-neutral final module pass applied after eXact lowering and before maps. */
export type ModuleTransform = (
	input: Readonly<{
		id: string;
		source: string;
		target: TransformTarget;
	}>
) => Readonly<{ code: string }>;

/** Defines the transform target type contract. */
export type TransformTarget = 'default' | 'client' | 'server';

/** Defines the exact asset kind type contract. */
export type ExactAssetKind =
	| 'style'
	| 'image'
	| 'video'
	| 'audio'
	| 'font'
	| 'document'
	| 'data'
	| 'worker'
	| 'other';

/** Defines the exact asset import mode type contract. */
export type ExactAssetImportMode = 'side-effect' | 'url' | 'raw' | 'inline' | 'module' | 'worker';

/** Defines the exact asset target type contract. */
export type ExactAssetTarget = 'client' | 'server' | 'both' | 'embedded';

/** Defines the exact asset rule type contract. */
export type ExactAssetRule = {
	extensions?: readonly string[];
	queries?: readonly string[];
	kind: ExactAssetKind;
	importMode?: ExactAssetImportMode;
	evaluationTarget?: Exclude<ExactAssetTarget, 'embedded'>;
	deliveryTarget?: ExactAssetTarget;
};

/** Defines the exact asset dependency ir type contract. */
export type ExactAssetDependencyIR = {
	specifier: string;
	kind: ExactAssetKind;
	importMode: ExactAssetImportMode;
	evaluationTarget: Exclude<ExactAssetTarget, 'embedded'>;
	deliveryTarget: ExactAssetTarget;
};

/** Defines the exact raw html capability ir type contract. */
export type ExactRawHtmlCapabilityIR = {
	source: string;
	line: number;
	column: number;
	symbol: string;
	targets: ExactArtifactTarget[];
};

/** Describes the result produced by transform. */
export type TransformResult = {
	code: string;
	map: ExactSourceMap | null;
	filename: string;
	manifest: ExactCompilerManifest;
};

/** Defines the exact source map type contract. */
export type ExactSourceMap = {
	version: 3;
	file?: string;
	sources: string[];
	sourcesContent?: string[];
	names: string[];
	mappings: string;
};
