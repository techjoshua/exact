import type { ExactCompilerManifest } from './manifest.js';
import type { ExactPlacement } from './policy.js';

export type PackageExportMapOptions = {
	packageRoot: string;
	sourceRoot?: string;
	clientCondition?: string;
	serverCondition?: string;
	defaultTarget?: 'client' | 'server';
	typesRoot?: string;
};

export type PackageExportEntry = {
	[condition: string]: string;
};

export type ExactArtifactTarget = 'client' | 'server';

export type ExactExportConditionOptions = {
	clientCondition?: string;
	serverCondition?: string;
};

export type ExactArtifactImportResolution = {
	id: string;
	target: ExactArtifactTarget;
};

export type ExactArtifactGraphOptions = PackageExportMapOptions & ClientIslandRegistryOptions;

export type ExactArtifactGraph = {
	conditions: {
		client: string[];
		server: string[];
	};
	packageExports: Record<string, PackageExportEntry>;
	componentEdges: ExactArtifactComponentEdge[];
	clientIslands: ClientIslandRegistryEntry[];
	serverParts: ServerPartRegistryEntry[];
	artifacts: ExactArtifactGraphEntry[];
};

export type ExactArtifactComponentEdge = {
	id: string;
	sourceFile: string;
	sourceComponentId: string;
	sourceName: string;
	targetComponentId?: string;
	targetName: string;
	tag: string;
	placement: ExactPlacement;
	boundary: ExactPlacement;
	index: number;
	path: string;
};

export type ExactArtifactGraphEntry = {
	inputFile: string;
	clientFile: string;
	serverFile: string;
	sharedFile?: string;
	manifestFile: string;
	manifest: ExactCompilerManifest;
};

export type ClientIslandRegistryOptions = {
	rootDir?: string;
};

export type ClientIslandRegistryEntry = {
	id: string;
	name: string;
	exportName: string;
	module: string;
	componentId?: string;
};

export type ServerPartRegistryOptions = {
	rootDir?: string;
};

export type ServerPartRegistryEntry = {
	id: string;
	name: string;
	exportName: string;
	module: string;
	componentId?: string;
};

export type ExactRegistryModuleOptions = {
	exportName?: string;
};

export type ExactHydrationRegistrationModuleOptions = {
	endpoint?: string;
	endpoints?: ExactHydrationEndpointRoutes;
	islandsExportName?: string;
	registrationExportName?: string;
};

export type ExactHydrationEndpointRoutes = {
	actions?: Record<string, string>;
	boundaries?: Record<string, string>;
};

export type ExactArtifactRegistryModulesOptions = {
	clientExportName?: string;
	serverExportName?: string;
};

export type ExactArtifactRegistryModules = {
	client: string;
	server: string;
};
