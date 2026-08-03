import type { ExactArtifactTarget } from './artifacts.js';
import type { ExactPlacement } from './policy.js';

/** Defines the exact environment effect type contract. */
export type ExactEnvironmentEffect = 'neutral' | 'browser' | 'server' | 'mixed' | 'unknown';

/** Defines the exact environment effect source ir type contract. */
export type ExactEnvironmentEffectSourceIR = {
	environment: 'browser' | 'server' | 'unknown';
	description: string;
	path: string[];
};

/** Defines the exact call edge ir type contract. */
export type ExactCallEdgeIR = {
	id: string;
	name: string;
	targetId?: string;
	moduleSpecifier?: string;
	exportName?: string;
	resolved: boolean;
	receiverBindings?: Array<{
		parameterIndex: number;
		source: 'component' | 'parameter' | 'unknown';
		sourceParameterIndex?: number;
	}>;
};

/** Defines the exact callable summary ir type contract. */
export type ExactCallableSummaryIR = {
	id: string;
	name: string;
	kind: 'function' | 'method' | 'component' | 'task' | 'initializer' | 'module-initializer';
	exportNames: string[];
	directEffect: ExactEnvironmentEffect;
	effect: ExactEnvironmentEffect;
	directEffectSources: ExactEnvironmentEffectSourceIR[];
	effectSources: ExactEnvironmentEffectSourceIR[];
	calls: ExactCallEdgeIR[];
	artifactTargets: ExactArtifactTarget[];
	stateReads: ExactStateEffect[];
	stateWrites: ExactStateEffect[];
	contexts: ExactContextEffect[];
	/** Whether repeated evaluation is free of externally observable mutation. */
	reevaluationSafe?: boolean;
};

/** Defines the exact state effect type contract. */
export type ExactStateEffect = {
	path: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'broad' | 'unknown';
	operation?: 'map' | 'set';
	receiver?: { kind: 'component' } | { kind: 'parameter'; index: number } | { kind: 'unknown' };
};

/** Defines the exact context effect type contract. */
export type ExactContextEffect = {
	token: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'unknown';
};

/** Defines the exact task ir type contract. */
export type ExactTaskIR = {
	id: string;
	placement: ExactPlacement;
	requestedPlacement?: 'server' | 'client';
	priority: 'immediate' | 'normal' | 'deferred';
	readiness: 'blocking' | 'nonblocking';
	concurrency?: 'parallel' | 'latest' | 'queue';
	detached?: boolean;
	functionDefined?: boolean;
	invoked?: boolean;
	argumentCount?: number;
	activationArgumentCount?: number;
	capturedParameters: number[];
	async: boolean;
	browserEffects: boolean;
	/** Source-ordered values captured as scheduled dependency snapshots. */
	dependencies: Array<{
		index: number;
		source: 'state' | 'props' | 'context' | 'derived';
		contextToken?: string;
	}>;
	/** Reactive reads sampled without becoming activation dependencies. */
	capturedInputs: Array<{
		parameter: number;
		source: 'state' | 'props' | 'context' | 'derived';
		path: string;
		contextToken?: string;
	}>;
	reads: ExactStateEffect[];
	writes: ExactStateEffect[];
	contexts: ExactContextEffect[];
	diagnostics: string[];
	environmentEffect?: ExactEnvironmentEffect;
	effectSources?: ExactEnvironmentEffectSourceIR[];
};

/** Defines the exact component render edge ir type contract. */
export type ExactComponentRenderEdgeIR = {
	id: string;
	tag: string;
	name: string;
	componentId?: string;
	placement: ExactPlacement;
	boundary: ExactPlacement;
	index: number;
	path: string;
};

/** Defines the exact component ir type contract. */
export type ExactComponentIR = {
	id: string;
	name: string;
	exported: boolean;
	placement: ExactPlacement;
	subgraphPlacement: ExactPlacement;
	renderEdges: ExactComponentRenderEdgeIR[];
	clientIslandCount: number;
	tasks: ExactTaskIR[];
	contexts: ExactContextEffect[];
	splitBoundaries: string[];
	diagnostics: string[];
	environmentEffect?: ExactEnvironmentEffect;
	artifactTargets?: ExactArtifactTarget[];
};

/** Defines the exact export ir type contract. */
export type ExactExportIR = {
	name: string;
	kind: 'component' | 'value';
	placement: ExactPlacement;
};

/** Defines the exact artifact export ir type contract. */
export type ExactArtifactExportIR = ExactExportIR & {
	artifactClass: 'shared' | 'dual' | 'client' | 'server';
};

/** Defines the exact symbol ir type contract. */
export type ExactSymbolIR = {
	id: string;
	componentId?: string;
	exportName?: string;
	localName: string;
	generatedName: string;
	debugName: string;
	kind: 'component' | 'value';
	role: 'root' | 'server-part' | 'client-island';
	target: 'client' | 'server' | 'both';
	placement: ExactPlacement;
};

/** Defines the exact boundary ir type contract. */
export type ExactBoundaryIR = {
	id: string;
	name: string;
	componentId?: string;
	ownerComponentId?: string;
	renderEdgeId?: string;
	renderEdgeIndex?: number;
	renderPath?: string;
	kind: 'client-island' | 'server-slot' | 'partition-range';
	planVersion?: number;
	buildKey?: string;
	planEdgeId?: string;
	parentPlanId?: string;
	fallbackPlanId?: string;
	patchTargets?: string[];
	discriminatorKind?: 'single' | 'branch' | 'keyed';
	discriminatorValues?: string[];
	generation?: number;
};

/** Defines the normalized build-scoped recursive client/server partition plan. */
export type ExactPartitionPlanIR = {
	version: 1;
	/** Opaque identity shared by compatible artifacts from this build. */
	buildKey: string;
	readonly roots: readonly string[];
	readonly nodes: readonly ExactPartitionPlanNodeIR[];
	readonly edges: readonly ExactPartitionPlanEdgeIR[];
};

/** Defines one reusable component or structural partition template. */
export type ExactPartitionPlanNodeIR = {
	id: string;
	kind:
		| 'component'
		| 'enhancement-component'
		| 'region'
		| 'conditional-template'
		| 'keyed-template'
		| 'readiness-boundary';
	componentContract?: string;
	ownerComponent: string;
	placement: 'client' | 'server' | 'either';
	artifactTargets: readonly ExactArtifactTarget[];
	activation: 'server-only' | 'eager' | 'interaction' | 'inert';
	refreshAuthority: 'client' | 'server' | 'none';
	start: number;
	length: number;
	renderPath: readonly string[];
	childEdges: readonly string[];
	optional?: boolean;
	conservative?: boolean;
	reason?: string;
};

/** Defines one finite edge in a recursive partition plan. */
export type ExactPartitionPlanEdgeIR = {
	id: string;
	parent: string;
	child: string;
	kind:
		| 'component'
		| 'enhancement'
		| 'region'
		| 'branch'
		| 'keyed-item'
		| 'server-range'
		| 'client-range'
		| 'readiness';
	cardinality: 'one' | 'optional' | 'branch' | 'many-keyed';
	data: readonly Readonly<{
		id: string;
		kind: 'prop' | 'state' | 'capture' | 'public-context' | 'server-context-name';
		direction: 'client-to-server' | 'server-to-client' | 'host-resolved';
		transfer: 'snapshot' | 'ordered-delta' | 'opaque-identity' | 'context-lookup';
		residency: 'client' | 'server' | 'either';
		secret: boolean;
	}>[];
	fallback: string;
	start: number;
	length: number;
	renderPath: readonly string[];
};

/** Defines the exact imported component ir type contract. */
export type ExactImportedComponentIR = {
	name: string;
	boundaryName?: string;
	placement: ExactPlacement;
	componentId?: string;
};

/** Defines the exact semantic scope ir type contract. */
export type ExactSemanticScopeIR = {
	id: string;
	parentId?: string;
	kind: 'module' | 'function' | 'block';
	nodeKind: string;
};

/** Defines the exact semantic declaration ir type contract. */
export type ExactSemanticDeclarationIR = {
	id: string;
	name: string;
	scopeId: string;
	kind: 'import' | 'function' | 'class' | 'variable' | 'parameter' | 'type' | 'interface';
	nodeStart: number;
	nodeEnd: number;
	moduleSpecifier?: string;
	importedName?: string;
	typeOnly?: boolean;
	exportedName?: string;
};

/** Defines the exact semantic reference ir type contract. */
export type ExactSemanticReferenceIR = {
	name: string;
	scopeId: string;
	source: 'local' | 'import' | 'global' | 'unresolved';
	nodeStart: number;
	nodeEnd: number;
	declarationId?: string;
	declarationKind?: ExactSemanticDeclarationIR['kind'];
	moduleSpecifier?: string;
	importedName?: string;
	typeOnly?: boolean;
	exportedName?: string;
};

/** Defines the exact semantic export ir type contract. */
export type ExactSemanticExportIR = {
	exportedName: string;
	localName?: string;
	importedName?: string;
	moduleSpecifier?: string;
	typeOnly?: boolean;
};

/** Defines the exact semantic graph ir type contract. */
export type ExactSemanticGraphIR = {
	scopes: ExactSemanticScopeIR[];
	declarations: ExactSemanticDeclarationIR[];
	references: ExactSemanticReferenceIR[];
	exports: ExactSemanticExportIR[];
};
