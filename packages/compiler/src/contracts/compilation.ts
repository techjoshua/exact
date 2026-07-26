import type { ModuleRewriteOptions } from '@exactjs/expressions';
import type { ExactPreparedCompilerRegistry } from '@exactjs/plugin-api';
import type { ExactCompilerSession } from '../expression/project.js';
import type {
	ExactArtifactGraph,
	ExactArtifactGraphEntry,
	ExactArtifactGraphOptions
} from './artifacts.js';
import type { ExactCompilerManifest } from './manifest.js';
import type {
	ExactAssetRule,
	ModuleTransform,
	TransformOptions,
	TransformResult
} from './transform.js';

/** Configures compile file. */
export type CompileFileOptions = TransformOptions & {
	outDir?: string;
	rootDir?: string;
	emitManifest?: boolean;
};

/** Describes the result produced by compile file. */
export type CompileFileResult = TransformResult & {
	inputFile: string;
	outputFile?: string;
	sourceMapFile?: string;
	manifestFile?: string;
};

/** Configures compile project. */
export type CompileProjectOptions = TransformOptions & {
	outDir?: string;
	rootDir?: string;
	emitManifest?: boolean;
};

/** Configures compile artifacts. */
export type CompileArtifactsOptions = {
	outDir: string;
	rootDir?: string;
	filename?: string;
	importedManifests?: readonly ExactCompilerManifest[];
	serverComponents?: boolean;
	sourceMap?: boolean;
	moduleRewrite?: ModuleRewriteOptions;
	moduleTransform?: ModuleTransform;
	jsxInterop?: TransformOptions['jsxInterop'];
	assetRules?: readonly ExactAssetRule[];
	session?: ExactCompilerSession;
	pluginRegistry?: ExactPreparedCompilerRegistry;
	generatedValidation?: 'syntax' | 'semantic';
	packageType?: TransformOptions['packageType'];
	packageName?: string;
	capabilityPolicy?: TransformOptions['capabilityPolicy'];
	/** Discovers manifests advertised by installed packages. Defaults to true. */
	discoverPackageManifests?: boolean;
};

/** Describes the result produced by compile artifacts. */
export type CompileArtifactsResult = {
	inputFile: string;
	clientFile: string;
	serverFile: string;
	sharedFile?: string;
	clientMapFile?: string;
	serverMapFile?: string;
	manifestFile: string;
	client: TransformResult;
	server: TransformResult;
	shared?: TransformResult;
	manifest: ExactCompilerManifest;
};

/** Defines the exact artifact graph input type contract. */
export type ExactArtifactGraphInput = {
	inputFile: string;
	clientFile: string;
	serverFile: string;
	sharedFile?: string;
	manifestFile: string;
	manifest: ExactCompilerManifest;
};

/** Configures compile artifact plan entries. */
export type CompileArtifactPlanEntriesOptions = {
	filename?(entry: ExactArtifactPlanEntry): string;
	importedManifests?: readonly ExactCompilerManifest[];
	serverComponents?: boolean;
	sourceMap?: boolean;
	moduleRewrite?: ModuleRewriteOptions;
	moduleTransform?: ModuleTransform;
	jsxInterop?: TransformOptions['jsxInterop'];
	assetRules?: readonly ExactAssetRule[];
	session?: ExactCompilerSession;
	pluginRegistry?: ExactPreparedCompilerRegistry;
	generatedValidation?: 'syntax' | 'semantic';
	packageType?: TransformOptions['packageType'];
	packageName?: string;
	capabilityPolicy?: TransformOptions['capabilityPolicy'];
	/** Discovers manifests advertised by installed packages. Defaults to true. */
	discoverPackageManifests?: boolean;
};

/** Defines the exact discovered package manifest type contract. */
export type ExactDiscoveredPackageManifest = {
	packageName: string;
	packageRoot: string;
	manifestFile: string;
	manifest: ExactCompilerManifest;
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
	manifestFile: string;
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
	entries: ExactArtifactGraphEntry[];
	graph: ExactArtifactGraph;
};

/** Defines the exact artifact dev state update type contract. */
export type ExactArtifactDevStateUpdate = ExactArtifactDevState & {
	diff: ExactArtifactPlanDiff;
	compiled: CompileArtifactsResult[];
};
