import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import type { ExactLanguageExtensionsConfig } from '@exactjs/config';
import type { ExactPackageEnhancementImport } from '@exactjs/config';
import type { ExactCompilerSession } from '../expression/project.js';
import type { ExactSourceInspection } from '../language-tools/contracts.js';
import type {
	ExactArtifactGraph,
	ExactArtifactBuildProducts,
	ExactArtifactGraphOptions
} from './artifacts.js';
import type {
	ExactAssetRule,
	ModuleRewriteOptions,
	ModuleTransform,
	TransformOptions,
	TransformResult
} from './transform.js';

/** Configures compile file. */
export type CompileFileOptions = TransformOptions & {
	outDir?: string;
	rootDir?: string;
	/** Shared package-language validation policy, or false to disable package validation. */
	languageExtensions?: ExactLanguageExtensionsConfig | false;
};

/** Describes the result produced by compile file. */
export type CompileFileResult = TransformResult & {
	inputFile: string;
	outputFile?: string;
	sourceMapFile?: string;
};

/** Configures compile project. */
export type CompileProjectOptions = TransformOptions & {
	outDir?: string;
	rootDir?: string;
	/** Includes non-JSX JavaScript and TypeScript modules for no-emit project checking. */
	includeAllModules?: boolean;
	/** Shared package-language validation policy, or false to disable package validation. */
	languageExtensions?: ExactLanguageExtensionsConfig | false;
};

/** Configures compile artifacts. */
export type CompileArtifactsOptions = {
	outDir: string;
	/** Immutable deployment namespace; deterministically derived from all inputs when omitted. */
	buildKey?: string;
	rootDir?: string;
	filename?: string;
	serverComponents?: boolean;
	sourceMap?: boolean;
	moduleRewrite?: ModuleRewriteOptions;
	moduleTransform?: ModuleTransform;
	jsxInterop?: TransformOptions['jsxInterop'];
	assetRules?: readonly ExactAssetRule[];
	session?: ExactCompilerSession;
	generatedValidation?: 'syntax' | 'semantic';
	packageType?: TransformOptions['packageType'];
	packageName?: string;
	capabilityPolicy?: TransformOptions['capabilityPolicy'];
	/** Emits one target-neutral inspection result per authored module. */
	emitInspection?: TransformOptions['emitInspection'];
	/** Adds compact client-only correlation slots independently from catalog emission. */
	instrumentInspection?: TransformOptions['instrumentInspection'];
	/** Controls the server-only build catalog packaged from emitted module inspections. */
	inspection?: ExactArtifactInspectionOptions;
	/** Shared package-language validation policy, or false to disable package validation. */
	languageExtensions?: ExactLanguageExtensionsConfig | false;
	/** Package-wide enhancement bindings loaded from exact configuration. */
	packageEnhancements?: readonly ExactPackageEnhancementImport[];
};

/** Configures packaging for one immutable, server-owned build inspection catalog. */
export type ExactArtifactInspectionOptions = {
	/** Immutable deployment identity. A deterministic content hash is used when omitted. */
	buildKey?: string;
	/** Runtime execution root represented by the catalog. Defaults to the root component ID. */
	executionRoot?: string;
	/** Root component type. Defaults to the first compiler-inspected component. */
	rootComponentId?: string;
	/** Project root used to make every retained source path relative. */
	projectRoot?: string;
	/** Optional server-private output path. Defaults under `.exact-inspection` in `outDir`. */
	outputFile?: string;
	producer?: Readonly<{ packageName?: string; version?: string }>;
	redactions?: Partial<ExactInspectionRedactionCatalog>;
};

/** Target-neutral source inspection retained with a compiled artifact result. */
export type ExactCompiledArtifactInspection = Readonly<{
	inspectionFile?: string;
	inspection: ExactSourceInspection;
}>;

/** Describes the result produced by compile artifacts. */
export type CompileArtifactsResult = {
	inputFile: string;
	clientFile: string;
	serverFile: string;
	sharedFile?: string;
	clientMapFile?: string;
	serverMapFile?: string;
	client: TransformResult;
	server: TransformResult;
	shared?: TransformResult;
	build: ExactArtifactBuildProducts;
	inspection?: ExactCompiledArtifactInspection;
};

/** Defines the exact artifact graph input type contract. */
export type ExactArtifactGraphInput = {
	inputFile: string;
	clientFile: string;
	serverFile: string;
	sharedFile?: string;
	build: ExactArtifactBuildProducts;
};

/** Configures compile artifact plan entries. */
export type CompileArtifactPlanEntriesOptions = {
	filename?(entry: ExactArtifactPlanEntry): string;
	/** Immutable deployment namespace shared by all entries. */
	buildKey?: string;
	serverComponents?: boolean;
	sourceMap?: boolean;
	moduleRewrite?: ModuleRewriteOptions;
	moduleTransform?: ModuleTransform;
	jsxInterop?: TransformOptions['jsxInterop'];
	assetRules?: readonly ExactAssetRule[];
	session?: ExactCompilerSession;
	generatedValidation?: 'syntax' | 'semantic';
	packageType?: TransformOptions['packageType'];
	packageName?: string;
	capabilityPolicy?: TransformOptions['capabilityPolicy'];
	emitInspection?: TransformOptions['emitInspection'];
	instrumentInspection?: TransformOptions['instrumentInspection'];
	/** Package-wide enhancement bindings loaded from exact configuration. */
	packageEnhancements?: readonly ExactPackageEnhancementImport[];
};

/** Configures exact artifact plan. */
export type ExactArtifactPlanOptions = {
	outDir: string;
	rootDir?: string;
};

/** Describes the planned exact artifact operation. */
export type ExactArtifactPlan = {
	rootDir: string;
	entries: ExactArtifactPlanEntry[];
};

/** Defines the exact artifact plan entry type contract. */
export type ExactArtifactPlanEntry = {
	inputFile: string;
	clientFile: string;
	serverFile: string;
	sharedFile: string;
};

/** Defines the exact artifact plan diff type contract. */
export type ExactArtifactPlanDiff = {
	added: ExactArtifactPlanEntry[];
	removed: ExactArtifactPlanEntry[];
	changed: ExactArtifactPlanEntry[];
	retained: ExactArtifactPlanEntry[];
};

/** Configures exact artifact plan diff. */
export type ExactArtifactPlanDiffOptions = {
	changedInputs?: readonly string[];
};

/** Configures exact artifact dev state. */
export type ExactArtifactDevStateOptions = CompileArtifactsOptions & ExactArtifactGraphOptions;

/** Tracks the state owned by exact artifact dev. */
export type ExactArtifactDevState = {
	plan: ExactArtifactPlan;
	entries: ExactArtifactGraphInput[];
	graph: ExactArtifactGraph;
};

/** Defines the exact artifact dev state update type contract. */
export type ExactArtifactDevStateUpdate = ExactArtifactDevState & {
	diff: ExactArtifactPlanDiff;
	compiled: CompileArtifactsResult[];
};
