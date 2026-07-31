import type { ExactPreparedCompilerRegistry } from '@exactjs/plugin-api';
import type {
	ExactBuildInspectionCatalog,
	ExactInspectionRedactionCatalog
} from '@exactjs/devtools-protocol';
import type { ExactCompilerSession } from '../expression/project.js';
import type { ExactArtifactTarget } from './artifacts.js';
import type { ExactCompilerExplanation } from './explanation.js';
import type { ExactCompilerManifest } from './manifest.js';
import type { ExactSourceInspection } from '../language-tools/contracts.js';
import type { ExactSourceEntityKind } from '../language-tools/contracts.js';

/** Replaces one imported or exported binding during native module lowering. */
export interface ModuleExportReplacement {
	readonly sourceModule: string;
	readonly sourceExport: string;
	readonly targetModule: string;
	readonly targetExport: string;
}

/** Configures module aliases and binding replacements owned by the native compiler. */
export interface ModuleRewriteOptions {
	readonly filename?: string;
	readonly moduleAliases?: Readonly<Record<string, string>>;
	readonly replacements?: readonly ModuleExportReplacement[];
	readonly sourceMap?: boolean;
}

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
	/** Emits a stable account of placement, transport, effects, and SSR resumption liveness. */
	explain?: boolean;
	/**
	 * Returns a server-owned static inspection catalog without embedding rich
	 * descriptions in generated JavaScript. `auto` follows the development
	 * default and is disabled when NODE_ENV is production.
	 */
	emitInspection?: boolean | 'auto';
	/**
	 * Lowers compact build-local source correlation records for an attached runtime inspector.
	 * `auto` follows the development default. Rich source metadata remains out-of-band.
	 */
	instrumentInspection?: boolean | 'auto';
	moduleRewrite?: ModuleRewriteOptions;
	moduleTransform?: ModuleTransform;
	/**
	 * Optional host-owned JSX component interop. The compiler remains independent
	 * of the foreign component runtime. Positively identified native eXact
	 * components remain direct; every other component tag is emitted through the
	 * one configured adapter, which performs the authoritative runtime brand check.
	 */
	jsxInterop?: ExactJsxInterop;
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

/** Describes an imported JSX component candidate to optional host interop analysis. */
export type ExactJsxInteropCandidate = {
	readonly importer: string;
	readonly sourceModule: string;
	readonly localName: string;
	readonly tagName: string;
	readonly declarationSources: readonly string[];
	readonly declarationSignatures: readonly string[];
};

/** Configures lowering for one compatibility runtime. */
export type ExactJsxInterop = {
	readonly adapterModule: string;
	readonly adapterExport: string;
	readonly cacheKey: string;
	/**
	 * Retained for host diagnostics and compatibility analysis. Lowering does not
	 * trust package ownership inference: cross-module eXact identity is determined
	 * from the compiler-emitted runtime brand.
	 */
	classify(candidate: ExactJsxInteropCandidate): 'exact' | 'component' | 'unknown' | 'ambiguous';
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
	explanation?: ExactCompilerExplanation;
	/** Optional host-side inspection catalog; never embedded in generated code. */
	inspectionCatalog?: ExactSourceInspection;
	/** Compact IDs lowered for runtime correlation; contains no paths, reasons, or source text. */
	inspectionCorrelation?: ExactRuntimeInspectionCorrelation;
};

/** Compact component-local source entity identity shared with instrumented runtime output. */
export type ExactRuntimeInspectionCorrelation = Readonly<{
	protocol: 1;
	/** Compiler-qualified selectors only; never contains a corresponding value. */
	redactions?: ExactInspectionRedactionCatalog;
	components: readonly Readonly<{
		componentTypeId: string;
		slots: readonly Readonly<{ id: string; kind: ExactSourceEntityKind }>[];
	}>[];
}>;

/** Server-only build catalog emitted by a compiler or framework adapter. */
export type ExactCompiledBuildInspection = Readonly<{
	inspectionFile?: string;
	catalog: ExactBuildInspectionCatalog;
}>;

/** Defines the exact source map type contract. */
export type ExactSourceMap = {
	version: 3;
	file?: string;
	sources: string[];
	sourcesContent?: string[];
	names: string[];
	mappings: string;
};
