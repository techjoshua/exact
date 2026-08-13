import type { NativeCompilerModuleRewrite } from './process-module-contracts.js';
import type {
	NativeCompilerComponent,
	NativeCompilerComponentResumption
} from './process-component-contracts.js';
import type { NativeCompilerDiagnostic } from './process-diagnostic-contracts.js';
import type { NativeCompilerPolicyAnalysis } from './process-policy-contracts.js';
import type { NativeCompilerPartitionPlan } from './process-partition-contracts.js';
import type { NativeCompilerSemanticGraph } from './process-semantic-contracts.js';
import type { NativeCompilerTask } from './process-task-contracts.js';
import type { NativeCompilerContinuation } from './process-continuation-contracts.js';
import type { ExactActivationDecision } from './process-activation-contracts.js';
import type {
	NativeCompilerStateAlias,
	NativeCompilerStateEffect,
	NativeCompilerStateRead
} from './process-state-contracts.js';

export type {
	NativeCompilerModuleExportReplacement,
	NativeCompilerModuleRewrite
} from './process-module-contracts.js';
export type {
	NativeCompilerComponent,
	NativeCompilerComponentResumption,
	NativeCompilerRenderEdge
} from './process-component-contracts.js';
export type { NativeCompilerDiagnostic } from './process-diagnostic-contracts.js';
export type {
	NativeCompilerDataPolicy,
	NativeCompilerPolicyFlow,
	NativeCompilerPolicyAnalysis,
	NativeCompilerPolicySubject,
	NativeCompilerSecretConsumer
} from './process-policy-contracts.js';
export type { NativeCompilerSemanticGraph } from './process-semantic-contracts.js';
export type {
	NativeCompilerPartitionPlan,
	NativeCompilerPartitionPlanEdge,
	NativeCompilerPartitionPlanNode
} from './process-partition-contracts.js';
export type {
	NativeCompilerTask,
	NativeCompilerTaskResource,
	NativeCompilerTaskSignalCall
} from './process-task-contracts.js';
export type { NativeCompilerContinuation } from './process-continuation-contracts.js';
export type * from './process-activation-contracts.js';
export type * from './process-state-contracts.js';

/** Exact protocol implemented by this JavaScript facade. */
export const nativeCompilerProtocolVersion = '1.34.0';

/** Request accepted by the persistent native eXact compiler process. */
export type NativeCompilerRequest = Readonly<{
	id?: string;
	kind: 'version' | 'reset' | 'diagnose' | 'analyze' | 'compile' | 'extension';
	source?: string;
	root?: string;
	/** Immutable deployment namespace shared by every artifact in one partition graph. */
	buildKey?: string;
	configFile?: string;
	target?: 'default' | 'client' | 'server';
	componentContractProjection?: 'complete' | 'hydrate' | 'client';
	serverComponents?: boolean;
	preserveComponentHoisting?: boolean;
	diagnostics?: 'syntax' | 'semantic';
	sourceMap?: boolean;
	packageType?: 'application' | 'library';
	packageName?: string;
	capabilities?: NativeCompilerCapabilityPolicy;
	assetRules?: readonly NativeCompilerAssetRule[];
	preserveClientAssetImports?: boolean;
	jsxInterop?: NativeCompilerJSXInterop;
	moduleRewrite?: NativeCompilerModuleRewrite;
	/** Adds compact source identity markers without retaining rich inspection metadata. */
	instrumentInspection?: boolean;
	/** First virtual package-enhancement offset appended after authored source. */
	packageEnhancementBoundary?: number;
	/** Namespaced native frontend operation isolated from standard compiler semantics. */
	extension?: Readonly<{ namespace: string; payload?: unknown }>;
}>;

/** Host-owned runtime brand adapter used for unproven JSX component values. */
export type NativeCompilerJSXInterop = Readonly<{
	adapterModule: string;
	adapterExport: string;
}>;

/** Serializable asset classification rule consumed by native import planning. */
export type NativeCompilerAssetRule = Readonly<{
	extensions: readonly string[];
	queries: readonly string[];
	kind: 'style' | 'image' | 'video' | 'audio' | 'font' | 'document' | 'data' | 'worker' | 'other';
	importMode?: 'side-effect' | 'url' | 'raw' | 'inline' | 'module' | 'worker';
	evaluationTarget?: 'client' | 'server' | 'both';
	deliveryTarget?: 'client' | 'server' | 'both' | 'embedded';
}>;

/** Normalized build-asset edge returned by the Go host. */
export type NativeCompilerAssetDependency = Readonly<{
	specifier: string;
	kind: NativeCompilerAssetRule['kind'];
	importMode: NonNullable<NativeCompilerAssetRule['importMode']>;
	evaluationTarget: 'client' | 'server' | 'both';
	deliveryTarget: 'client' | 'server' | 'both' | 'embedded';
}>;

/** Application-owned privileged-feature grants consumed by the Go host. */
export type NativeCompilerCapabilityPolicy = Readonly<{
	unsafeHtml: Readonly<{
		enabled: boolean;
		grants: readonly string[];
	}>;
	secrets: Readonly<{
		allowPackages: readonly string[];
	}>;
}>;

/** Portable privileged-feature requirements emitted by a package. */
export type NativeCompilerCapabilityRequirements = Readonly<{
	rawHtml: readonly Readonly<{
		source: string;
		line: number;
		column: number;
		symbol: string;
		targets: readonly ('client' | 'server')[];
	}>[];
}>;

/** Describes one static ECMAScript import discovered by the native parser. */
export type NativeCompilerImport = Readonly<{
	moduleSpecifier: string;
	typeOnly: boolean;
	sideEffectOnly: boolean;
	runtimeBinding: boolean;
	enhancement?: boolean;
	start: number;
	length: number;
}>;

/** Native phase timings measured inside the persistent process. */
export type NativeCompilerTimings = Readonly<{
	parseMicroseconds: number;
	programMicroseconds: number;
	analysisMicroseconds: number;
	sourceMicroseconds: number;
	callableMicroseconds: number;
	policyTaskMicroseconds: number;
	projectLinkMicroseconds: number;
	checkMicroseconds: number;
	loweringMicroseconds: number;
	printMicroseconds: number;
	totalMicroseconds: number;
}>;

/** Source map emitted directly while the Go printer writes transformed nodes. */
export type NativeCompilerSourceMap = Readonly<{
	version: 3;
	file: string;
	sourceRoot: string;
	sources: readonly string[];
	names: readonly string[];
	mappings: string;
	sourcesContent?: readonly (string | null)[];
}>;

/** Describes one authored or compiler-generated artifact export. */
export type NativeCompilerSymbol = Readonly<{
	id: string;
	componentId?: string;
	exportName?: string;
	localName: string;
	generatedName: string;
	debugName: string;
	kind: 'component' | 'value';
	role: 'root' | 'server-part' | 'client-island';
	target: 'client' | 'server' | 'both';
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
}>;

/** Describes one authored runtime value exported by the compiled module. */
export type NativeCompilerExport = Readonly<{
	name: string;
	kind: 'component' | 'value';
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
}>;

/** Describes one compiler-owned client island or server slot boundary. */
export type NativeCompilerBoundary = Readonly<{
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
	patchTargets?: readonly string[];
	discriminatorKind?: 'single' | 'branch' | 'keyed';
	discriminatorValues?: string[];
	generation?: number;
	activation?: ExactActivationDecision;
}>;

/** Describes one JSX attribute discovered inside the native process. */
export type NativeCompilerJSXAttribute = Readonly<{
	namespace?: string;
	name?: string;
	valueKind: 'boolean' | 'string' | 'expression' | 'spread';
	start: number;
	length: number;
}>;

/** Describes one JSX opening element discovered inside the native process. */
export type NativeCompilerJSXElement = Readonly<{
	tag: string;
	intrinsic: boolean;
	start: number;
	length: number;
	attributes: readonly NativeCompilerJSXAttribute[];
}>;

/** Canonical enhancement selection joined to one authored JSX activation. */
export type NativeCompilerEnhancementActivation = Readonly<{
	namespace: string;
	activator: string;
	start: number;
	length: number;
	targetStart: number;
	targetLength: number;
	identity: string;
	moduleSpecifier: string;
	exportName: string;
	application: 'direct' | 'enhancement-target' | 'target-intrinsic' | 'propagated';
}>;

/** Describes one direct component-state mutation discovered natively. */
export type NativeCompilerStateWrite = Readonly<{
	component: string;
	path: readonly string[];
	operation: 'assignment' | 'update' | 'delete' | 'array-mutation';
	setupExecution?: 'initialization' | 'deferred-reactive';
	start: number;
	length: number;
}>;

/** Preserves one authored component or intrinsic value/callback binding edge. */
export type NativeCompilerValueBinding = Readonly<{
	component: string;
	statePath: readonly string[];
	valueProp: string;
	callbackProp: string;
	callbackValueType: string;
	additionalParameters: number;
	additionalParameterTypes: readonly string[];
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	artifactTargets: readonly ('client' | 'server')[];
	intrinsicAdapter?: string;
	start: number;
	length: number;
}>;

/** Describes one context-token dependency discovered natively. */
export type NativeCompilerContextEffect = Readonly<{
	token: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'unknown';
}>;

/** Explains one placement requirement retained through callable propagation. */
export type NativeCompilerEnvironmentEffectSource = Readonly<{
	environment: 'browser' | 'server' | 'unknown';
	description: string;
	path: readonly string[];
}>;

/** Describes one local callable dependency. */
export type NativeCompilerCallEdge = Readonly<{
	id: string;
	name: string;
	targetId?: string;
	moduleSpecifier?: string;
	exportName?: string;
	resolved: boolean;
	receiverBindings?: readonly Readonly<{
		parameterIndex: number;
		source: 'component' | 'parameter' | 'unknown';
		sourceParameterIndex?: number;
	}>[];
}>;

/** Contains the completed native effect summary for one source callable. */
export type NativeCompilerCallable = Readonly<{
	id: string;
	name: string;
	kind: 'function' | 'method' | 'component' | 'task' | 'initializer' | 'module-initializer';
	exportNames: readonly string[];
	directEffect: 'neutral' | 'browser' | 'server' | 'mixed' | 'unknown';
	effect: 'neutral' | 'browser' | 'server' | 'mixed' | 'unknown';
	directEffectSources: readonly NativeCompilerEnvironmentEffectSource[];
	effectSources: readonly NativeCompilerEnvironmentEffectSource[];
	calls: readonly NativeCompilerCallEdge[];
	artifactTargets: readonly ('client' | 'server')[];
	stateReads: readonly NativeCompilerStateEffect[];
	stateWrites: readonly NativeCompilerStateEffect[];
	contexts: readonly NativeCompilerContextEffect[];
	reevaluationSafe: boolean;
}>;

/** Describes native reactive provenance for one component lexical binding. */
export type NativeCompilerReactiveBinding = Readonly<{
	component: string;
	name: string;
	provenance: 'state' | 'props' | 'context' | 'derived' | 'cell' | 'snapshot' | 'unknown';
	contextToken?: string;
	dependencies: readonly string[];
	definition: Readonly<{ start: number; length: number }>;
	references: readonly Readonly<{ start: number; length: number }>[];
	safeToReevaluate: boolean;
	start: number;
	length: number;
}>;

/** Contains eXact-owned analysis facts which are safe to cross the process boundary. */
export type NativeCompilerAnalysis = Readonly<{
	imports: readonly NativeCompilerImport[];
	components: readonly NativeCompilerComponent[];
	jsx: readonly NativeCompilerJSXElement[];
	stateAliases: readonly NativeCompilerStateAlias[];
	stateReads: readonly NativeCompilerStateRead[];
	stateWrites: readonly NativeCompilerStateWrite[];
	valueBindings: readonly NativeCompilerValueBinding[];
	reactiveBindings: readonly NativeCompilerReactiveBinding[];
	callables: readonly NativeCompilerCallable[];
	tasks: readonly NativeCompilerTask[];
	exports: readonly NativeCompilerExport[];
	symbols: readonly NativeCompilerSymbol[];
	boundaries: readonly NativeCompilerBoundary[];
	partitionPlan: NativeCompilerPartitionPlan;
	continuations: readonly NativeCompilerContinuation[];
	registries?: readonly NativeCompilerComponentRegistry[];
	rendererEnhancements: readonly Readonly<{
		identity: string;
		moduleSpecifier: string;
		exportName: string;
	}>[];
	enhancementActivations?: readonly NativeCompilerEnhancementActivation[];
	resumptions: readonly NativeCompilerComponentResumption[];
	policy: NativeCompilerPolicyAnalysis;
	requiredCapabilities: NativeCompilerCapabilityRequirements;
	assets: readonly NativeCompilerAssetDependency[];
	semanticGraph: NativeCompilerSemanticGraph;
}>;

/** Process-safe component registry provenance emitted by the native compiler. */
export type NativeCompilerComponentRegistry = Readonly<{
	id: string;
	name: string;
	entries: readonly Readonly<{
		key: string;
		mode: 'eager' | 'lazy';
		componentId: string;
		componentName: string;
		placement: 'client' | 'server' | 'isomorphic' | 'unknown';
		moduleSpecifier?: string;
		exportName?: string;
		ownership: 'exact' | 'react-compat';
		artifactTargets: readonly ('client' | 'server')[];
	}>[];
}>;

/** Response returned for one native compiler request. */
export type NativeCompilerResponse = Readonly<{
	id?: string;
	protocolVersion: string;
	typescriptVersion: string;
	backendVersion: string;
	code?: string;
	sourceMap?: NativeCompilerSourceMap;
	diagnostics: readonly NativeCompilerDiagnostic[];
	analysis: NativeCompilerAnalysis;
	timings: NativeCompilerTimings;
	cacheHit?: boolean;
	error?: string;
	/** Namespaced response returned only for an extension request. */
	extension?: unknown;
}>;
