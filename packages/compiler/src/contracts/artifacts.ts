import type { ExactStateEffect } from './analysis.js';
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
	continuations: ExactHydrationContinuationPlan[];
	execution: ExactExecutionContractPlan;
	artifacts: ExactArtifactGraphEntry[];
};

/** Stable state path used by generated hydration registrations. */
export type ExactHydrationStatePathPlan = Readonly<{
	path: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'broad' | 'unknown';
}>;

/** Compiler-owned hydration description for one distributed task continuation. */
export type ExactHydrationContinuationPlan = Readonly<{
	kind: 'task';
	id: string;
	componentId: string;
	readiness: 'blocking' | 'nonblocking';
	dependencies: readonly Readonly<{ source: 'state' | 'props' | 'derived' | 'argument' }>[];
	stateReads: readonly ExactHydrationStatePathPlan[];
	stateWrites: readonly ExactHydrationStatePathPlan[];
	publicContexts: readonly string[];
	serverContexts: readonly string[];
	contextWrites: readonly string[];
	serverContextWrites: readonly string[];
	boundaries: readonly string[];
	invocation?: Readonly<{
		arguments: readonly Readonly<{ source: 'argument' }>[];
		concurrency: 'parallel' | 'latest' | 'queue';
	}>;
}>;

/** Runtime operation authority produced directly by the compiler. */
export type ExactExecutableOperationPlan = Readonly<{
	id: string;
	componentId: string;
	reads: readonly ExactStateEffect[];
	writes: readonly ExactStateEffect[];
	publicContexts: readonly string[];
	serverContexts: readonly string[];
	boundaries: readonly string[];
}>;

/** Runtime boundary authority produced directly by the compiler. */
export type ExactExecutableBoundaryPlan = Readonly<{
	id: string;
	componentId?: string;
	ownerComponentId?: string;
	kind: 'client-island' | 'server-slot';
}>;

/** Narrow executable authority for compiled artifacts. */
export type ExactExecutionContractPlan = Readonly<{
	operations: readonly ExactExecutableOperationPlan[];
	boundaries: readonly ExactExecutableBoundaryPlan[];
}>;

/** Registry symbol retained solely to create target-specific module registrations. */
export type ExactArtifactRegistryPlan = Readonly<{
	id: string;
	name: string;
	exportName: string;
	componentId?: string;
}>;

/** Supported compiler products consumed by build adapters and artifact graph creation. */
export type ExactArtifactBuildProducts = Readonly<{
	source: Readonly<{ filename: string; dependencies: readonly string[] }>;
	componentIds: readonly string[];
	exposureRoots: readonly Readonly<{ componentId: string; exportName: string }>[];
	componentEdges: readonly ExactArtifactComponentEdge[];
	clientRegistrations: readonly ExactArtifactRegistryPlan[];
	serverRegistrations: readonly ExactArtifactRegistryPlan[];
	continuations: readonly ExactHydrationContinuationPlan[];
	execution: ExactExecutionContractPlan;
}>;

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
	build: ExactArtifactBuildProducts;
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
