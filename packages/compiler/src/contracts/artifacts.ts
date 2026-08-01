import type { ExactModuleAnalysis } from './module-analysis.js';
import type { ExactPlacement } from './policy.js';

/** Configures package export map. */
export type PackageExportMapOptions = {
	packageRoot: string;
	sourceRoot?: string;
	clientCondition?: string;
	serverCondition?: string;
	defaultTarget?: 'client' | 'server';
	typesRoot?: string;
};

/** Defines the package export entry type contract. */
export type PackageExportEntry = {
	[condition: string]: string;
};

/** Defines the exact artifact target type contract. */
export type ExactArtifactTarget = 'client' | 'server';

/** Configures exact export condition. */
export type ExactExportConditionOptions = {
	clientCondition?: string;
	serverCondition?: string;
};

/** Defines the exact artifact import resolution type contract. */
export type ExactArtifactImportResolution = {
	id: string;
	target: ExactArtifactTarget;
};

/** Configures exact artifact graph. */
export type ExactArtifactGraphOptions = PackageExportMapOptions & ClientIslandRegistryOptions;

/** Defines the exact artifact graph type contract. */
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

/** Defines the exact artifact component edge type contract. */
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

/** Defines the exact artifact graph entry type contract. */
export type ExactArtifactGraphEntry = {
	inputFile: string;
	clientFile: string;
	serverFile: string;
	sharedFile?: string;
	analysis: ExactModuleAnalysis;
};

/** Configures client island registry. */
export type ClientIslandRegistryOptions = {
	rootDir?: string;
};

/** Defines the client island registry entry type contract. */
export type ClientIslandRegistryEntry = {
	id: string;
	name: string;
	exportName: string;
	module: string;
	componentId?: string;
};

/** Configures server part registry. */
export type ServerPartRegistryOptions = {
	rootDir?: string;
};

/** Defines the server part registry entry type contract. */
export type ServerPartRegistryEntry = {
	id: string;
	name: string;
	exportName: string;
	module: string;
	componentId?: string;
};

/** Configures exact hydration registration module. */
export type ExactHydrationRegistrationModuleOptions = {
	endpoint?: string;
	endpoints?: ExactHydrationEndpointRoutes;
	islandsExportName?: string;
	registrationExportName?: string;
};

/** Defines the exact hydration endpoint routes type contract. */
export type ExactHydrationEndpointRoutes = {
	invocations?: Record<string, string>;
	boundaries?: Record<string, string>;
};
