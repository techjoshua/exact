import type {
	ExactBuildInspectionCatalog,
	ExactInspectionRedactionCatalog
} from '@exactjs/devtools-protocol';
import type { ExactCompilerSession } from '../expression/project.js';
import type { ExactArtifactTarget } from './artifacts.js';
import type { ExactCompilerExplanation } from './explanation.js';
import type { ExactSourceInspection } from '../language-tools/contracts.js';
import type { ExactSourceEntityKind } from '../language-tools/contracts.js';
import type { ExactPackageEnhancementImport } from '@exactjs/config';

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
	/** TypeScript project configuration used for semantic analysis and generated-code checking. */
	configFile?: string;
	/** Enhancement imports declared package-wide by the owning exact configuration. */
	packageEnhancements?: readonly ExactPackageEnhancementImport[];
	/** Immutable deployment namespace shared by coordinated client/server artifacts. */
	buildKey?: string;
	/** Owned incremental compiler state; direct callers use the process-default session when omitted. */
	session?: ExactCompilerSession;
	target?: TransformTarget;
	/**
	 * Projects the complete compiler-owned component contract for a concrete runtime bundle.
	 * Omit this for rendering-mode-neutral output; bundler adapters set it from their render mode.
	 */
	componentContractProjection?: ComponentContractProjection;
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

/**
 * Host-neutral final module pass applied after eXact lowering.
 * A pass that changes code must return a version 3 map when source maps are requested.
 */
export type ModuleTransform = (
	input: Readonly<{
		id: string;
		source: string;
		target: TransformTarget;
	}>
) => Readonly<{
	code: string;
	/** Maps transformed output back to the supplied pre-transform source. */
	map?: unknown;
}>;

/** Defines the transform target type contract. */
export type TransformTarget = 'default' | 'client' | 'server';

/** Selects the runtime component-contract subset retained by a physical bundle. */
export type ComponentContractProjection = 'complete' | 'hydrate' | 'client' | 'server-render';

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

/** Identifies one compiler-resolved renderer capability imported by a module. */
export type ExactRendererEnhancementIR = {
	identity: string;
	moduleSpecifier: string;
	exportName: string;
};

/** Explains why a build adapter must resolve one imported component edge. */
export type ExactComponentImportReason =
	| 'render'
	| 'enhancement'
	| 'registry'
	| 'task-owner'
	| 'continuation';

/** Target-neutral component facts consumed by build adapters without carrying trust decisions. */
export type ExactComponentBuildFacts = Readonly<{
	protocol: 1;
	filename: string;
	/** Optional integration hint. Resolved package provenance remains authoritative. */
	packageName?: string;
	components: readonly Readonly<{
		id: string;
		placement: import('./policy.js').ExactPlacement;
		artifactTargets: readonly ExactArtifactTarget[];
	}>[];
	componentImports: readonly Readonly<{
		ownerComponentId: string;
		moduleSpecifier: string;
		exportName: string;
		canonicalComponentId?: string;
		artifactTargets: readonly ExactArtifactTarget[];
		reason: ExactComponentImportReason;
	}>[];
	rendererEnhancements: readonly Readonly<{
		identity: string;
		moduleSpecifier: string;
		exportName: string;
	}>[];
}>;

/** Static protocol-1 build facts published by a precompiled eXact component library. */
export type ExactPublishedComponentBuildFacts = Readonly<{
	protocol: 1;
	package: Readonly<{ name: string; version: string }>;
	modules: readonly Readonly<{
		path: string;
		facts: Omit<ExactComponentBuildFacts, 'filename' | 'packageName'>;
	}>[];
	exports: readonly Readonly<{
		subpath: string;
		condition: string;
		module: string;
		exportName: string;
		componentId: string;
	}>[];
}>;

/** Describes the result produced by transform. */
export type TransformResult = {
	code: string;
	map: ExactSourceMap | null;
	filename: string;
	/** Descriptive protocol facts for authoritative build-tool graph authorization. */
	componentBuild: ExactComponentBuildFacts;
	/** Build-facing capability imports; emitted independently of application plugin registries. */
	rendererEnhancements?: readonly ExactRendererEnhancementIR[];
	explanation?: ExactCompilerExplanation;
	/** Optional host-side inspection catalog; never embedded in generated code. */
	inspectionCatalog?: ExactSourceInspection;
	/** Value-free redaction identities paired with the optional inspection catalog. */
	inspectionRedactions?: ExactInspectionRedactionCatalog;
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
