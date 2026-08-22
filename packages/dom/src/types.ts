import type {
	AnyEnhancementComponentFunction,
	AnyComponentInstance,
	EnhancementEntry,
	Child,
	ComponentContextValues,
	ComponentFunction,
	ExactRuntimeInspectionOwner,
	ActivityMode,
	ErrorContextValue,
	ErrorReport,
	Logger,
	ReadinessContextValue,
	ReadinessRegistration,
	StopHandle,
	UnsafeHtmlAuditEvent,
	VNode
} from '@exactjs/core';
import type { ExactRenderProgramInvocation } from '@exactjs/core/runtime/render';
import type { ReadinessCoordinator } from '@exactjs/core';
import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';
import type { EffectScope } from '@exactjs/reactive';
import type { DomWorkBudget } from './work.js';
import type { RetainedMountedRanges } from './renderer/retained-range.js';
import type { TaskFrameExecution } from '@exactjs/core/framework/task-frames';

/** Defines the mounted type contract. */
export type Mounted = {
	vnode: VNode;
	dom: Node;
	/** Optional closing boundary marker when this subtree was adopted from SSR. */
	end?: Node;
	/** Marker range that wraps an ordinary keyed list item vnode. */
	range?: 'item';
	scope: EffectScope;
	children: Mounted[];
	/** Last normalized output of a compiler-owned dynamic range. */
	dynamicChildren?: readonly Child[];
	/** Invocation-local readers and resolved nodes for a compiler-owned render program. */
	renderProgram?: {
		invocation: ExactRenderProgramInvocation;
		/** Intrinsic root used for compiler-path ownership when `dom` is an SSR range marker. */
		readonly programRoot: Node;
		readonly slotNodes: readonly (Node | undefined)[];
		readonly root: Root;
		readonly parentInstance?: AnyComponentInstance;
		/** Last effective planned props, grouped by their target element. */
		props?: Map<Element, Record<string, unknown>>;
		/** Mounted structural ranges keyed by their compiler slot index. */
		childSlots?: Array<{
			readonly slot: number;
			readonly end: Comment;
			children: Mounted[];
			value?: readonly Child[];
			/** Last scalar VNode for a compiler-proven fixed-cardinality component slot. */
			componentValue?: VNode;
		}>;
		/** Applies replacement readers without recreating the retained slot watcher. */
		refresh?: () => void;
	};
	/** Physical parent for children whose logical parent remains elsewhere. */
	portalTarget?: Node;
	/** Runs once the subtree's source range has a physical parent. */
	afterPlacement?: () => void;
	rendering?: boolean;
	rerenderPending?: boolean;
	instance?: AnyComponentInstance;
	/** Cached component-root candidates published after this component's structure is complete. */
	componentRootCache?: {
		target?: Element;
		host?: Element;
	};
	delegatedEvents?: Map<string, EventListener>;
	stop?: StopHandle;
	/** Semantic target exported by an ordinary `_target` boundary and its route dependencies. */
	targetBoundary?: {
		selected?: Mounted;
		owner?: AnyComponentInstance;
		dependencies?: Set<Mounted>;
		release?: () => void;
	};
	/** Target boundaries whose route currently depends on this mounted structural owner. */
	targetDependents?: Set<Mounted>;
	/** Independently owned `_target` property layers currently attached to this intrinsic. */
	targetContributions?: Map<
		Mounted,
		Readonly<{ props: Readonly<Record<string, unknown>>; owner?: AnyComponentInstance }>
	>;
	/** Last effective intrinsic props after composing authored and `_target` layers. */
	targetEffectiveProps?: Record<string, unknown>;
	/** Native event subscriptions installed for independently owned target layers. */
	targetEventReleases?: Array<() => void>;
	/** Unmanaged nodes between an opaque raw-HTML range's boundary markers. */
	rawNodes?: Node[];
	/** Reserved framework-owned insertion point after authored host children. */
	childEnd?: Node;
	/** Active enhancement-component chain whose public identity remains the authored target. */
	enhancement?: {
		readonly entries: readonly EnhancementEntry[];
		readonly inheritedIdentities: ReadonlySet<string>;
		readonly target: Mounted;
		readonly boundaries: ReadonlyMap<string, readonly Mounted[]>;
	};
	/** Retained native Activity state owned by this boundary mount. */
	activity?: {
		mode: ActivityMode;
		readonly token: symbol;
		readonly contentScope: EffectScope;
		readonly readiness: ReadinessCoordinator;
		readonly owner: AnyComponentInstance;
		readonly parentReadiness?: ReadinessContextValue;
		readinessRegistration?: ReadinessRegistration;
		activationGeneration: number;
		retained?: RetainedMountedRanges;
	};
	/** Generation-owned candidate state for a native Suspense boundary. */
	suspense?: {
		readonly coordinator: ReadinessCoordinator;
		readonly owner: AnyComponentInstance;
		readonly parentInstance?: AnyComponentInstance;
		revealed: boolean;
		releaseTransition?: () => void;
		candidate?: {
			readonly generation: number;
			readonly children: Mounted[];
		};
	};
};

/** Defines the root type contract. */
export type Root = {
	container: Element;
	mounted?: Mounted;
	delegated: Map<Node, Map<string, EventListener>>;
	portalTargets: Set<Node>;
	eventContainer?: Node;
	errors: ErrorContextValue;
	current: VNode;
	version: number;
	boundary: ComponentFunction<{}, { version: number }>;
	logger?: Logger;
	/** Root-provided contexts inherited by components without a logical parent. */
	ambientContexts?: ComponentContextValues;
	debugMarkers: boolean;
	maxTreeDepth: number;
	traversalDepth: number;
	maxTreeNodes: number;
	traversedNodes: number;
	workDepth: number;
	/** Interaction-local reconciliation work collected only while an event is active. */
	interactionWork?: { reconciliations: number; traversedNodes: number };
	workBudget?: DomWorkBudget;
	allowUnsafeHtml: boolean;
	onUnsafeHtml?: (event: UnsafeHtmlAuditEvent) => void;
	onProfile?: ExactProfileSink<DomProfileEvent>;
	/** Trusted compiler-generated enhancement component catalog for this renderer root. */
	enhancementCatalog?: ReadonlyMap<string, AnyEnhancementComponentFunction>;
	/** Canonical unavailable identities already reported by this renderer root. */
	unavailableEnhancements?: Set<string>;
	/** Nested authored marker depth used to activate one complete logical declaration subtree. */
	enhancementNesting?: number;
	/** Guards patch-time route reconciliation while a changed declaration subtree is rebuilt. */
	enhancementReconciliationDepth?: number;
	/** Re-evaluates compiler-owned reactive root selectors for the current mounted tree. */
	reconcileEnhancements?: () => void;
	/** Hydrated roots are anchored by SSR markers rather than the synthetic client root boundary. */
	mode?: 'client' | 'hydrated' | 'document';
	/** Becomes true after the root's first client mount or hydration adoption finishes. */
	initialCommitComplete?: boolean;
	/** Forces one complete retry after a patch failed with partially advanced mounted metadata. */
	patchRecoveryRequired?: boolean;
	/** Component ranges are inferred when the public server format omits eXact markers. */
	markerlessHydration?: boolean;
	/** Renderer-internal mounts parked during one cross-domain replacement transaction. */
	replacementParking?: {
		mounts: Map<VNode, Array<{ mounted: Mounted; parent: Node }>>;
		commits: Array<() => void>;
	};
	/** Structurally absent ranges retained while component-root release work settles. */
	releasing?: Set<{
		readonly parent: Node;
		readonly mounted: Mounted;
		readonly execution: TaskFrameExecution<void>;
		readonly generations: ReadonlyMap<AnyComponentInstance, number>;
		readonly activityToken: symbol;
		finalized: boolean;
	}>;
};

/** Configures render. */
export type RenderOptions = {
	logger?: Logger;
	debugMarkers?: boolean;
	/** Observes errors that reach the renderer root without a component boundary. */
	onErrorReport?: (report: ErrorReport) => void;
	/** Maximum nested vnode depth accepted by mounting, patching, or hydration. */
	maxTreeDepth?: number;
	/** Maximum vnode and placeholder child values processed by one DOM update. */
	maxTreeNodes?: number;
	/** Allows unsafeHtml() ranges. The application accepts responsibility for their contents. */
	allowUnsafeHtml?: boolean;
	/** Receives an audit notification whenever an unsafe HTML range is mounted or changed. */
	onUnsafeHtml?: (event: UnsafeHtmlAuditEvent) => void;
	/** Receives coarse renderer timings and traversal counts. */
	onProfile?: ExactProfileSink<DomProfileEvent>;
	/** Compiler-generated mapping from canonical enhancement identity to component implementation. */
	enhancementCatalog?: ReadonlyMap<string, AnyEnhancementComponentFunction>;
	/** Internal shared budget used when hydration combines DOM scans and renderer work. */
	workBudget?: DomWorkBudget;
	/** Internal logical parent used by a late island mounted in a nested DOM root. */
	logicalParent?: AnyComponentInstance;
	/** Explicit instrumented owner installed only when runtime inspection is built in. */
	inspection?: ExactRuntimeInspectionOwner;
};

/** Reports an observable dom profile event. */
export type DomProfileEvent = ExactProfileEvent<'dom', 'render'>;
