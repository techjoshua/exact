import type { ExactPlacement } from '../contracts/policy.js';
import type { ExactLanguageProjectionV1 } from '@exactjs/language-extension-api';

/** Half-open UTF-16 source range used by compiler-aware editor features. */
export type ExactSourceRange = Readonly<{
	start: number;
	end: number;
}>;

/** Semantic region kinds owned by the eXact compiler. */
export type ExactSourceEntityKind =
	| 'component'
	| 'initializer'
	| 'render'
	| 'render-expression'
	| 'inferred-task'
	| 'explicit-task'
	| 'interaction'
	| 'derived'
	| 'state-assignment'
	| 'binding'
	| 'context-read'
	| 'context-write'
	| 'lifecycle'
	| 'registry-selection';

/** Stable reason codes explaining a compiler classification. */
export type ExactInferenceReasonCode =
	| 'awaited-state-flow'
	| 'initial-render-dependency'
	| 'reactive-dependency'
	| 'browser-api'
	| 'server-context'
	| 'server-module'
	| 'requested-placement'
	| 'requested-readiness'
	| 'requested-priority'
	| 'recognized-signal-call'
	| 'owned-resource'
	| 'returned-cleanup'
	| 'secret-qualified-flow'
	| 'transport-requirement'
	| 'render-effect'
	| 'unknown-call-effect';

/** One source location contributing to a propagated inference reason. */
export type ExactRelatedReason = Readonly<{
	summary: string;
	filename?: string;
	range: ExactSourceRange;
}>;

/** Compiler-owned explanation for one semantic classification. */
export type ExactInferenceReason = Readonly<{
	code: ExactInferenceReasonCode;
	summary: string;
	range: ExactSourceRange;
	related?: readonly ExactRelatedReason[];
}>;

/** A value that causes compiler-owned work to be reevaluated. */
export type ExactSourceDependency = Readonly<{
	kind: 'state' | 'prop' | 'context' | 'derived' | 'capture';
	path: string;
	range: ExactSourceRange;
	confidence: 'exact' | 'broad' | 'unknown';
}>;

/** A reactive value sampled into an omitted task parameter without scheduling from it. */
export type ExactTaskCapturedInput = Readonly<{
	parameter: number;
	kind: 'state' | 'prop' | 'context' | 'derived';
	path: string;
	range: ExactSourceRange;
}>;

/** An observable effect performed by a compiler-owned source region. */
export type ExactSourceEffect = Readonly<{
	kind: 'state-write' | 'context-write' | 'external-effect';
	path?: string;
	range: ExactSourceRange;
	confidence: 'exact' | 'broad' | 'unknown';
}>;

/** A recognized call that receives its owning generation's abort signal. */
export type ExactSuppliedSignal = Readonly<{
	range: ExactSourceRange;
	parameter: number;
	mode: 'direct' | 'options';
}>;

/** A resource whose release is controlled by the component or task generation. */
export type ExactOwnedResource = Readonly<{
	kind: string;
	range: ExactSourceRange;
	disposal?: string;
	description?: string;
}>;

/** Setup-once component classification. */
export type ExactInitializerClassification = Readonly<{
	kind: 'initializer';
	execution: 'once-per-instance';
	placement: ExactPlacement;
}>;

/** Fine-grained reactive render classification. */
export type ExactRenderClassification = Readonly<{
	kind: 'render';
	execution: 'reactive';
	dependencies: readonly ExactSourceDependency[];
	effects: readonly ExactSourceEffect[];
	referencedComponent?: Readonly<{
		id?: string;
		placement: ExactPlacement;
		boundary: ExactPlacement;
	}>;
}>;

/**
 * Normalized semantics of compiler-inferred task work or a task with authored policy.
 *
 * The `explicit` origin is the compatibility discriminator for source with a
 * compiler-recognized final `TaskContext` policy parameter. It does not denote
 * a separate task mechanism.
 */
export type ExactTaskClassification = Readonly<{
	kind: 'task';
	origin: 'inferred' | 'explicit';
	placement: ExactPlacement;
	placementRequest?: 'client' | 'server';
	priority: 'immediate' | 'normal' | 'deferred';
	readiness: 'blocking' | 'nonblocking';
	concurrency: 'parallel' | 'latest' | 'queue';
	detached: boolean;
	dependencies: readonly ExactSourceDependency[];
	capturedInputs: readonly ExactTaskCapturedInput[];
	effects: readonly ExactSourceEffect[];
	publication: 'staged' | 'immediate';
	cancellation: 'generation-abort-signal';
	signalCalls: readonly ExactSuppliedSignal[];
	resources: readonly ExactOwnedResource[];
	cleanup: 'none' | 'generation' | 'component';
}>;

/** Reactive lexical value classification. */
export type ExactDerivedClassification = Readonly<{
	kind: 'derived';
	dependencies: readonly ExactSourceDependency[];
	/** Authored initializer whose result defines this derived binding. */
	definition: ExactSourceRange;
	/** Symbol-resolved authored reads of this derived binding. */
	references: readonly ExactSourceRange[];
}>;

/** Setup assignment classified as one-time initialization or deferred reactive work. */
export type ExactStateAssignmentClassification = Readonly<{
	kind: 'state-assignment';
	execution: 'once-per-instance' | 'deferred-reactive';
	dependencies: readonly ExactSourceDependency[];
	effect: ExactSourceEffect;
}>;

/** Reactive DOM or property binding classification. */
export type ExactBindingClassification = Readonly<{
	kind: 'binding';
	dependencies: readonly ExactSourceDependency[];
	statePath: string;
	valueProp: string;
	callbackProp: string;
	callbackValueType: string;
	additionalParameters: number;
	additionalParameterTypes: readonly string[];
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	artifactTargets: readonly ('client' | 'server')[];
	intrinsicAdapter?: string;
}>;

/** Component-owned lifecycle registration classification. */
export type ExactLifecycleClassification = Readonly<{
	kind: 'lifecycle';
	ownership: 'component';
	disposal: 'automatic' | 'returned-cleanup';
}>;

/** Supported compiler classifications for editor-facing source regions. */
export type ExactSourceClassification =
	| ExactInitializerClassification
	| ExactRenderClassification
	| ExactTaskClassification
	| ExactDerivedClassification
	| ExactStateAssignmentClassification
	| ExactBindingClassification
	| ExactLifecycleClassification;

/** One node in an inspected component's authored semantic outline. */
export type ExactSourceEntity = Readonly<{
	id: string;
	kind: ExactSourceEntityKind;
	name?: string;
	range: ExactSourceRange;
	selectionRange: ExactSourceRange;
	children: readonly ExactSourceEntity[];
	classification?: ExactSourceClassification;
	reasons: readonly ExactInferenceReason[];
}>;

/** Compiler-owned semantic outline for one durable component. */
export type ExactInspectedComponent = ExactSourceEntity &
	Readonly<{
		kind: 'component';
		name: string;
	}>;

/** Summary of a safe diagnostic fix without editor-specific edits. */
export type ExactDiagnosticFixSummary = Readonly<{
	kind: ExactRefactorKind;
	title: string;
}>;

/** Rich eXact diagnostic projected from the same facts used by builds. */
export type ExactSourceDiagnostic = Readonly<{
	code: string;
	severity: 'information' | 'warning' | 'error';
	summary: string;
	explanation: string;
	range: ExactSourceRange;
	related: readonly Readonly<{
		message: string;
		filename: string;
		range: ExactSourceRange;
	}>[];
	fixes: readonly ExactDiagnosticFixSummary[];
}>;

/** Immutable inspection result for one language-service generation. */
export type ExactSourceInspection = Readonly<{
	generation: number;
	filename: string;
	/** Identifies configured versus bounded inferred project ownership. */
	project?: Readonly<{ kind: 'configured' | 'inferred'; root: string }>;
	/** Identifies the pinned compiler revisions that produced this inspection. */
	compiler: Readonly<{ typescriptVersion: string; backendVersion: string }>;
	/** Compiler-owned placement and ownership graph for this source generation. */
	partitionPlan: Readonly<ExactPartitionPlanIR>;
	components: readonly ExactInspectedComponent[];
	diagnostics: readonly ExactSourceDiagnostic[];
	/** Generic, serialized facts available to trusted package language analyzers. */
	languageProjection: ExactLanguageProjectionV1;
}>;

/** Options for selecting optional inspection projections. */
export type ExactInspectionRequest = Readonly<{
	includeReasons?: boolean;
}>;

/** No-emit project configuration for a compiler-aware language service. */
export type ExactLanguageServiceOptions = Readonly<{
	root: string;
	configFile?: string;
	noEmit?: true;
	/** Project ownership label used by language-server inferred workspaces. */
	projectKind?: 'configured' | 'inferred';
	/** Enhancement imports declared package-wide by the owning exact configuration. */
	packageEnhancements?: readonly import('@exactjs/config').ExactPackageEnhancementImport[];
	/** Maximum cold disk-backed analyses retained by one workspace. Defaults to 128. */
	maxCachedAnalyses?: number;
	/** Estimated byte budget for cold disk-backed analyses. Defaults to 32 MiB. */
	maxCachedAnalysisBytes?: number;
}>;

/** One overlay mutation synchronized into a retained compiler project. */
export type ExactLanguageServiceChange = Readonly<
	| { kind: 'upsert'; filename: string; version: number; source: string }
	| { kind: 'close'; filename: string }
	| { kind: 'delete'; filename: string }
>;

/** Result of atomically synchronizing an overlay batch. */
export type ExactLanguageServiceUpdate = Readonly<{
	generation: number;
	changedFiles: readonly string[];
	affectedFiles: readonly string[];
	diagnostics: readonly ExactSourceDiagnostic[];
}>;

/** Bounded resource and latency snapshot for one no-emit language workspace. */
export type ExactLanguageServiceStats = Readonly<{
	generation: number;
	overlays: number;
	analyzedFiles: number;
	snapshotEntries: number;
	snapshotSourceBytes: number;
	analysisEntries: number;
	analysisEstimatedBytes: number;
	importGraphEntries: number;
	importGraphEdges: number;
	analysisEvictions: number;
	cacheOverBudget: boolean;
	changedFiles: number;
	affectedFiles: number;
	lastSynchronizationMs: number;
}>;

/** Source edit planned against one immutable compiler generation. */
export type ExactSourceEdit = Readonly<{
	filename: string;
	range: ExactSourceRange;
	newText: string;
}>;

/** Compiler-supported semantic source transformations. */
export type ExactRefactorKind =
	| 'convert-to-explicit-task'
	| 'convert-to-inferred-task'
	| 'make-placement-explicit'
	| 'remove-redundant-placement'
	| 'make-blocking'
	| 'make-nonblocking'
	| 'split-placement-conflict';

/** Version-bound request for a compiler-planned source transformation. */
export type ExactRefactorRequest = Readonly<{
	generation: number;
	filename: string;
	range: ExactSourceRange;
	kind: ExactRefactorKind;
}>;

/** Compact normalized classification used by a refactor preview. */
export type ExactClassificationSummary = Readonly<{
	before: string;
	after: string;
	preserved: readonly string[];
}>;

/** Complete compiler-owned plan for an editor refactor. */
export type ExactRefactorPlan = Readonly<{
	title: string;
	semanticChange: 'none' | 'placement' | 'readiness' | 'priority' | 'ownership';
	explanation: string;
	edits: readonly ExactSourceEdit[];
	expected: ExactClassificationSummary;
}>;

/** Long-lived, no-emit compiler service used by editor integrations. */
export interface ExactLanguageService {
	synchronize(
		changes: readonly ExactLanguageServiceChange[],
		signal?: AbortSignal
	): Promise<ExactLanguageServiceUpdate>;
	inspect(
		filename: string,
		options?: ExactInspectionRequest,
		signal?: AbortSignal
	): Promise<ExactSourceInspection>;
	refactor(
		request: ExactRefactorRequest,
		signal?: AbortSignal
	): Promise<ExactRefactorPlan | undefined>;
	stats(): ExactLanguageServiceStats;
	dispose(): Promise<void>;
}
import type { ExactPartitionPlanIR } from '../contracts/analysis.js';
