import type { ExactPlacement } from './policy.js';
import type { ExactPartitionPlanIR } from './analysis.js';

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
	/** Immutable namespace shared by every retained partition plan and boundary. */
	buildKey: string;
	conditions: {
		client: string[];
		server: string[];
	};
	packageExports: Record<string, PackageExportEntry>;
	componentEdges: ExactArtifactComponentEdge[];
	clientIslands: ClientIslandRegistryEntry[];
	serverParts: ServerPartRegistryEntry[];
	operations: ExactTaskOperationPlan[];
	boundaries: ExactArtifactBoundaryPlan[];
	partitionPlans: ExactArtifactPartitionPlan[];
	artifacts: ExactArtifactGraphEntry[];
};

/** One module's normalized partition plan retained by the aggregate artifact graph. */
export type ExactArtifactPartitionPlan = Readonly<{
	inputFile: string;
	plan: ExactPartitionPlanIR;
}>;

/** Stable state path used by one generated task operation. */
export type ExactTaskStatePathPlan = Readonly<{
	path: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'broad' | 'unknown';
}>;

/** Compiler-owned build description for one distributed task operation. */
export type ExactTaskOperationPlan = Readonly<{
	kind: 'task';
	id: string;
	componentId: string;
	readiness: 'blocking' | 'nonblocking';
	concurrency: 'parallel' | 'latest' | 'queue';
	dependencies: readonly Readonly<{
		index: number;
		source: 'state' | 'props' | 'derived' | 'argument';
		path?: string;
	}>[];
	stateReads: readonly ExactTaskStatePathPlan[];
	stateWrites: readonly ExactTaskStatePathPlan[];
	publicContexts: readonly string[];
	serverContexts: readonly string[];
	contextWrites: readonly string[];
	serverContextWrites: readonly string[];
	boundaries: readonly string[];
	invocation?: Readonly<{
		arguments: readonly Readonly<{ index: number; source: 'argument'; path?: string }>[];
		concurrency: 'parallel' | 'latest' | 'queue';
	}>;
}>;

/** Compiler-owned build description for one client island or server slot boundary. */
export type ExactArtifactBoundaryPlan = Readonly<{
	id: string;
	componentId?: string;
	ownerComponentId?: string;
	kind: 'client-island' | 'server-slot' | 'partition-range';
	planVersion?: number;
	buildKey?: string;
	planEdgeId?: string;
	parentPlanId?: string;
	fallbackPlanId?: string;
	patchTargets?: readonly string[];
	discriminatorKind?: 'single' | 'branch' | 'keyed';
	discriminatorValues?: readonly string[];
	generation?: number;
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
	/** Target-neutral component facts retained beside artifact-specific products. */
	componentBuild: import('./transform.js').ExactComponentBuildFacts;
	dependencies: readonly string[];
	componentIds: readonly string[];
	exposureRoots: readonly Readonly<{ componentId: string; exportName: string }>[];
	componentEdges: readonly ExactArtifactComponentEdge[];
	clientRegistrations: readonly ExactArtifactRegistryPlan[];
	serverRegistrations: readonly ExactArtifactRegistryPlan[];
	operations: readonly ExactTaskOperationPlan[];
	boundaries: readonly ExactArtifactBoundaryPlan[];
	partitionPlan: ExactPartitionPlanIR;
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
	dependencies: readonly string[];
	componentIds: readonly string[];
	exposureRoots: readonly Readonly<{ componentId: string; exportName: string }>[];
};

/** Configures client island registry. */
export type ClientIslandRegistryOptions = {
	rootDir?: string;
};

/** Identifies one generated component implementation in a target module. */
export type ExactComponentRegistryEntry = {
	id: string;
	name: string;
	exportName: string;
	module: string;
	componentId?: string;
};

/** Defines the client island registry entry type contract. */
export type ClientIslandRegistryEntry = ExactComponentRegistryEntry;

/** Configures server part registry. */
export type ServerPartRegistryOptions = {
	rootDir?: string;
};

/** Defines the server part registry entry type contract. */
export type ServerPartRegistryEntry = ExactComponentRegistryEntry;

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
