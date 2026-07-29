import type { NativeCompilerModuleRewrite } from './process-module-contracts.js';
import type { NativeCompilerComponent } from './process-component-contracts.js';
import type { NativeCompilerDiagnostic } from './process-diagnostic-contracts.js';
import type { NativeCompilerPolicyManifest } from './process-policy-contracts.js';
import type { NativeCompilerSemanticGraph } from './process-semantic-contracts.js';

export type {
	NativeCompilerModuleExportReplacement,
	NativeCompilerModuleRewrite
} from './process-module-contracts.js';
export type {
	NativeCompilerComponent,
	NativeCompilerRenderEdge
} from './process-component-contracts.js';
export type { NativeCompilerDiagnostic } from './process-diagnostic-contracts.js';
export type {
	NativeCompilerDataPolicy,
	NativeCompilerPolicyFlow,
	NativeCompilerPolicyManifest,
	NativeCompilerPolicySubject,
	NativeCompilerSecretConsumer
} from './process-policy-contracts.js';
export type { NativeCompilerSemanticGraph } from './process-semantic-contracts.js';

/** Exact protocol implemented by this JavaScript facade. */
export const nativeCompilerProtocolVersion = '1.23.0';

/** Request accepted by the persistent native eXact compiler process. */
export type NativeCompilerRequest = Readonly<{
	id?: string;
	kind: 'version' | 'reset' | 'diagnose' | 'analyze' | 'compile';
	source?: string;
	root?: string;
	configFile?: string;
	target?: 'default' | 'client' | 'server';
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
	manifests?: readonly NativeCompilerExternalManifest[];
	extensions?: Readonly<Record<string, unknown>>;
	compatibilityExtensions?: Readonly<Record<string, readonly string[]>>;
	moduleRewrite?: NativeCompilerModuleRewrite;
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

/** Compact imported package contract consumed directly by the Go host. */
export type NativeCompilerExternalManifest = Readonly<{
	filename: string;
	packageName?: string;
	components: readonly Readonly<{
		exportName: string;
		name: string;
		componentId?: string;
		placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	}>[];
	callables: readonly NativeCompilerCallable[];
	policy: NativeCompilerPolicyManifest;
	capabilities: NativeCompilerCapabilityRequirements;
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
	extensionMicroseconds: number;
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
	kind: 'client-island' | 'server-slot';
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

/** Describes one direct component-state mutation discovered natively. */
export type NativeCompilerStateWrite = Readonly<{
	component: string;
	path: readonly string[];
	operation: 'assignment' | 'update' | 'delete' | 'array-mutation';
	start: number;
	length: number;
}>;

/** Describes one lexical alias for a component-owned state path. */
export type NativeCompilerStateAlias = Readonly<{
	component: string;
	name: string;
	path: readonly string[];
	start: number;
	length: number;
	invalidAt?: number;
}>;

/** Describes one component-state dependency discovered natively. */
export type NativeCompilerStateRead = Readonly<{
	component: string;
	path: readonly string[];
	confidence: 'exact' | 'broad';
	start: number;
	length: number;
}>;

/** Describes one component task registration and its normalized facets. */
export type NativeCompilerTask = Readonly<{
	id: string;
	component: string;
	facets: readonly string[];
	requestedPlacement?: 'client' | 'server';
	priority: 'normal' | 'deferred';
	readiness: 'blocking' | 'nonblocking';
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	async: boolean;
	browserEffects: boolean;
	serverEffects: boolean;
	environmentEffect: 'neutral' | 'browser' | 'server' | 'mixed' | 'unknown';
	reactiveDependencies: readonly string[];
	dependencies: readonly Readonly<{
		index: number;
		source: 'state' | 'props' | 'context' | 'derived';
		contextToken?: string;
	}>[];
	reads: readonly NativeCompilerStateEffect[];
	writes: readonly NativeCompilerStateEffect[];
	contexts: readonly NativeCompilerContextEffect[];
	effectSources: readonly NativeCompilerEnvironmentEffectSource[];
	resources: readonly NativeCompilerTaskResource[];
	signalCalls: readonly NativeCompilerTaskSignalCall[];
	diagnostics: readonly string[];
	start: number;
	length: number;
}>;

/** Describes one compiler-owned cross-runtime task transition. */
export type NativeCompilerContinuation = Readonly<{
	id: string;
	kind: 'task' | 'action';
	label?: string;
	componentId: string;
	taskId: string;
	placement: 'server' | 'isomorphic';
	readiness: 'blocking' | 'nonblocking';
	async: boolean;
	activation: Readonly<{
		stateReads: readonly NativeCompilerStateEffect[];
		dependencies: readonly Readonly<{
			index: number;
			source: 'state' | 'props' | 'derived' | 'argument';
		}>[];
		serverContexts: readonly NativeCompilerContextEffect[];
		publicContexts: readonly NativeCompilerContextEffect[];
	}>;
	effects: Readonly<{
		stateWrites: readonly NativeCompilerStateEffect[];
		contextWrites: readonly NativeCompilerContextEffect[];
		serverContextWrites: readonly NativeCompilerContextEffect[];
		boundaries: readonly string[];
	}>;
	ownership: Readonly<{
		componentId: string;
		lifetime: 'component' | 'invocation';
	}>;
	cancellation: 'abort-signal';
	invocation?: Readonly<{
		arguments: readonly Readonly<{
			index: number;
			source: 'argument';
		}>[];
		concurrency: 'parallel' | 'latest' | 'queue';
	}>;
}>;

/** Separates server activation requirements from browser resumption data. */
export type NativeCompilerComponentResumption = Readonly<{
	componentId: string;
	serverRender: Readonly<{
		stateReads: readonly string[];
		serverContexts: readonly NativeCompilerContextEffect[];
	}>;
	client: Readonly<{
		statePaths: readonly string[];
		valueCaptures: readonly string[];
		contexts: readonly string[];
		boundaries: readonly string[];
	}>;
}>;

/** Describes a resource owned by one native task generation. */
export type NativeCompilerTaskResource = Readonly<{
	kind:
		| 'timeout'
		| 'interval'
		| 'animation-frame'
		| 'idle-callback'
		| 'fetch'
		| 'observer'
		| 'owned';
	disposal?: string;
	description?: string;
	start: number;
	length: number;
}>;

/** Describes a call that receives cancellation from its owning task. */
export type NativeCompilerTaskSignalCall = Readonly<{
	parameter: number;
	mode: 'direct' | 'options';
	eventOptions?: boolean;
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

/** Describes one task effect against component-owned state. */
export type NativeCompilerStateEffect = Readonly<{
	path: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'broad' | 'unknown';
	operation?: 'map' | 'set';
	receiver?:
		| Readonly<{ kind: 'component' }>
		| Readonly<{ kind: 'parameter'; index: number }>
		| Readonly<{ kind: 'unknown' }>;
}>;

/** Describes native reactive provenance for one component lexical binding. */
export type NativeCompilerReactiveBinding = Readonly<{
	component: string;
	name: string;
	provenance: 'state' | 'props' | 'context' | 'derived' | 'cell' | 'snapshot' | 'unknown';
	contextToken?: string;
	dependencies: readonly string[];
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
	reactiveBindings: readonly NativeCompilerReactiveBinding[];
	callables: readonly NativeCompilerCallable[];
	tasks: readonly NativeCompilerTask[];
	exports: readonly NativeCompilerExport[];
	symbols: readonly NativeCompilerSymbol[];
	boundaries: readonly NativeCompilerBoundary[];
	continuations: readonly NativeCompilerContinuation[];
	registries?: readonly NativeCompilerComponentRegistry[];
	resumptions: readonly NativeCompilerComponentResumption[];
	policy: NativeCompilerPolicyManifest;
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
	manifestData?: Readonly<Record<string, unknown>>;
	analysis: NativeCompilerAnalysis;
	timings: NativeCompilerTimings;
	cacheHit?: boolean;
	error?: string;
}>;
