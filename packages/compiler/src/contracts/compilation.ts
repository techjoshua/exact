import type { ModuleRewriteOptions } from '@exact/expressions';
import type { ExactPreparedCompilerRegistry } from '@exact/plugin-api';
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

export type CompileFileOptions = TransformOptions & {
	outDir?: string;
	rootDir?: string;
	emitManifest?: boolean;
};

export type CompileFileResult = TransformResult & {
	inputFile: string;
	outputFile?: string;
	sourceMapFile?: string;
	manifestFile?: string;
};

export type CompileProjectOptions = TransformOptions & {
	outDir?: string;
	rootDir?: string;
	emitManifest?: boolean;
};

export type CompileArtifactsOptions = {
	outDir: string;
	rootDir?: string;
	filename?: string;
	importedManifests?: readonly ExactCompilerManifest[];
	serverComponents?: boolean;
	sourceMap?: boolean;
	moduleRewrite?: ModuleRewriteOptions;
	moduleTransform?: ModuleTransform;
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

export type ExactArtifactGraphInput = {
	inputFile: string;
	clientFile: string;
	serverFile: string;
	sharedFile?: string;
	manifestFile: string;
	manifest: ExactCompilerManifest;
};

export type CompileArtifactPlanEntriesOptions = {
	filename?(entry: ExactArtifactPlanEntry): string;
	importedManifests?: readonly ExactCompilerManifest[];
	serverComponents?: boolean;
	sourceMap?: boolean;
	moduleRewrite?: ModuleRewriteOptions;
	moduleTransform?: ModuleTransform;
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

export type ExactDiscoveredPackageManifest = {
	packageName: string;
	packageRoot: string;
	manifestFile: string;
	manifest: ExactCompilerManifest;
};

export type ExactArtifactPlanOptions = {
	outDir: string;
	rootDir?: string;
};

export type ExactArtifactPlan = {
	rootDir: string;
	entries: ExactArtifactPlanEntry[];
};

export type ExactArtifactPlanEntry = {
	inputFile: string;
	clientFile: string;
	serverFile: string;
	sharedFile: string;
	manifestFile: string;
};

export type ExactArtifactPlanDiff = {
	added: ExactArtifactPlanEntry[];
	removed: ExactArtifactPlanEntry[];
	changed: ExactArtifactPlanEntry[];
	retained: ExactArtifactPlanEntry[];
};

export type ExactArtifactPlanDiffOptions = {
	changedInputs?: readonly string[];
};

export type ExactArtifactDevStateOptions = CompileArtifactsOptions & ExactArtifactGraphOptions;

export type ExactArtifactDevState = {
	plan: ExactArtifactPlan;
	entries: ExactArtifactGraphEntry[];
	graph: ExactArtifactGraph;
};

export type ExactArtifactDevStateUpdate = ExactArtifactDevState & {
	diff: ExactArtifactPlanDiff;
	compiled: CompileArtifactsResult[];
};
