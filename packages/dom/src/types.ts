import type {
	AnyEnhancementComponentFunction,
	AnyComponentInstance,
	EnhancementEntry,
	Child,
	ComponentDomain,
	ComponentContextValues,
	ExactRuntimeInspectionOwner,
	ActivityMode,
	ErrorContextValue,
	ErrorReport,
	Logger,
	ReadinessContextValue,
	ReadinessRegistration,
	StopHandle,
	UnsafeHtmlAuditEvent
} from '@exactjs/core';
import type {
	ExactRenderProgramInvocation,
	ExactRenderProgramReceiptData
} from '@exactjs/core/runtime/render-operations';
import type {
	ExactClientComponentArtifact,
	ExactChildRangeReceiptData,
	ExactActivityReceiptData,
	ExactComponentReceiptData,
	ExactFragmentReceiptData,
	ExactIntrinsicReceiptData,
	ExactPortalReceiptData,
	ExactServerSlotReceiptData,
	ExactSuspenseReceiptData,
	ExactTargetReceiptData,
	ExactUnsafeHtmlReceiptData
} from '@exactjs/core/runtime/component-operations';

/** Parent and first node of a marker-free final-child range proven by a generated program. */
export type RenderProgramChildAnchor = readonly [parent: Node, start: Node | null];
import type { ReadinessCoordinator } from '@exactjs/core';
import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { DomWorkBudget } from './work.js';
import type { RetainedMountedRanges } from './renderer/retained-range.js';
import type { TaskFrameExecution } from '@exactjs/core/framework/task-frames';
import type { ComponentDomainLogging } from '@exactjs/core/framework/component-domains';

/** Defines the mounted type contract. */

export type Mounted = {
	/** Opaque authored native operation retained separately from renderer-private receipt data. */
	operation?: Child;
	/** Authored sibling identity joined by a focused compiler-owned keyed operation. */
	operationKey?: string;
	/** Opaque native component receipt redeemed directly through its selected target artifact. */
	componentReceipt?: ExactComponentReceiptData;
	/** Focused compiler-owned dynamic range operation. */
	childRangeReceipt?: ExactChildRangeReceiptData;
	/** Direct compiler-owned intrinsic operation. */
	intrinsicReceipt?: ExactIntrinsicReceiptData;
	/** Focused compiler-owned retained Activity boundary. */
	activityReceipt?: ExactActivityReceiptData;
	/** Focused compiler-owned readiness boundary. */
	suspenseReceipt?: ExactSuspenseReceiptData;
	/** Opaque compiler-owned browser render-program operation. */
	renderProgramReceipt?: ExactRenderProgramReceiptData;
	/** Compiler-owned transparent range. */
	fragmentReceipt?: ExactFragmentReceiptData;
	/** Compiler-owned semantic target range. */
	targetReceipt?: ExactTargetReceiptData;
	/** Compiler-authorized raw HTML range. */
	unsafeHtmlReceipt?: ExactUnsafeHtmlReceiptData;
	/** Focused logical-child placement into a renderer-owned target. */
	portalReceipt?: ExactPortalReceiptData;
	/** Compiler-owned retained server range adopted as an opaque DOM element. */
	serverSlotReceipt?: ExactServerSlotReceiptData;
	/** Direct scalar DOM text owned without an intermediate node record. */
	scalar?: true;
	scalarValue?: string;
	dom: Node;
	/** Optional closing boundary marker when this subtree was adopted from SSR. */
	end?: Node;
	/** Renderer-owned marker range that is not a native component operation. */
	range?: 'item' | 'root';
	scope: EffectScope;
	children: Mounted[];
	/** Last normalized output of a compiler-owned dynamic range. */
	dynamicChildren?: readonly Child[];
	/** Invocation-local readers and resolved nodes for a compiler-owned render program. */
	renderProgram?: {
		invocation: ExactRenderProgramInvocation;
		/** Intrinsic root used for compiler-path ownership when `dom` is an SSR range marker. */
		readonly programRoot: Node;
		readonly slotNodes: readonly (Node | RenderProgramChildAnchor | undefined)[];
		/** Component structural slots encoded as a number until an unusually high index needs a set. */
		readonly componentSlots?: number | ReadonlySet<number>;
		readonly root: Root;
		/** Durable authored owner used by compiler-generated state update wiring. */
		readonly bindingOwner?: AnyComponentInstance;
		/** Semantic parent used for contexts and structural child construction. */
		readonly parentInstance?: AnyComponentInstance;
		/** Last effective planned props, grouped by their target element. */
		props?: Map<Element, Record<string, unknown>>;
		/** Compact previous values for compiler-written property groups. */
		compiledProps?: Array<
			| Readonly<{
					element: Element;
					values: Record<string, unknown>;
			  }>
			| undefined
		>;
		/** Mounted structural ranges keyed by their compiler slot index. */
		childSlots?: Array<
			| {
					readonly parent: Node;
					readonly before: Node | null;
					children: Mounted[];
					value?: readonly Child[];
					/** Last opaque receipt for a compiler-proven fixed-cardinality component slot. */
					componentValue?: ExactComponentReceiptData;
			  }
			| undefined
		>;
		/** Compiler-selected structural slot operations invoked by the component dirty program. */
		directChildUpdates?: Array<(() => void) | undefined>;
		/** Receiver-owned prop receipts for compiler-proven component slots. */
		componentReceipts?: Array<(() => void) | undefined>;
		/** Applies replacement readers without recreating the retained slot watcher. */
		refresh?: () => void;
	};
	/** Physical parent for children whose logical parent remains elsewhere. */
	portalTarget?: Node;
	/** Runs once the subtree's source range has a physical parent. */
	afterPlacement?: () => void;
	/** Retention callbacks run after ordinary descendant and owner placement work settles. */
	afterPlacementPhase?: 'mount' | 'retention';
	rendering?: boolean;
	rerenderPending?: boolean;
	instance?: AnyComponentInstance;
	/** Target-local executable selected once when this native component range is constructed. */
	clientArtifact?: ExactClientComponentArtifact;
	/** Cached component-root candidates published after this component's structure is complete. */
	componentRootCache?: {
		target?: Element;
		host?: Element;
	};
	delegatedEvents?: Map<string, EventListener>;
	stop?: StopHandle;
	/** Readiness registration owned by a pending compiled child range. */
	suspensionRegistration?: ReadinessRegistration;
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
	/** Last complete authored root props supplied by a compiler-owned render program. */
	targetAuthoredProps?: Readonly<Record<string, unknown>>;
	/** Native event subscriptions installed for independently owned target layers. */
	targetEventReleases?: Array<() => void>;
	/** Unmanaged nodes between an opaque raw-HTML range's boundary markers. */
	rawNodes?: Node[];
	/** Reserved framework-owned insertion point after authored host children. */
	childEnd?: Node;
	/** Active enhancement-component chain whose public identity remains the authored target. */
	enhancement?: {
		/** Opaque authored operation retained as the public enhancement identity. */
		operation?: Child;
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
	current: Child;
	/** Domain selected for the root independently from the opaque child representation. */
	domain?: import('@exactjs/core').ComponentDomain;
	version: number;
	logger?: Logger;
	/** Shared component-logger lane for this framework-owned root. */
	componentLogging?: ComponentDomainLogging;
	/** Root-provided contexts inherited by components without a logical parent. */
	ambientContexts?: ComponentContextValues;
	debugMarkers: boolean;
	maxTreeDepth: number;
	traversalDepth: number;
	maxTreeNodes: number;
	traversedNodes: number;
	workDepth: number;
	/** Nested depth for the one focus-preservation transaction owned by this root. */
	focusTransactionDepth: number;
	/** Retention work committed after the outer DOM transaction finishes placing ordinary ranges. */
	placementRetentions?: Map<Mounted, () => void>;
	/** Focus state captured by the outermost active DOM transaction. */
	focusSnapshot?: DomFocusSnapshot;
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
		mounts: Map<Child, Array<{ mounted: Mounted; parent: Node }>>;
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

/** Focus and selection state retained only for the duration of one root DOM transaction. */
export type DomFocusSnapshot = {
	active: HTMLElement;
	inputSelection?: {
		start: number | null;
		end: number | null;
		direction: HTMLInputElement['selectionDirection'];
	};
	documentSelection?: {
		start: number[];
		startOffset: number;
		end: number[];
		endOffset: number;
	};
};

/** Configures render. */
export type RenderOptions = {
	logger?: Logger;
	debugMarkers?: boolean;
	/** Observes errors that reach the renderer root without a component boundary. */
	onErrorReport?: (report: ErrorReport) => void;
	/** Maximum nested operation depth accepted by mounting, patching, or hydration. */
	maxTreeDepth?: number;
	/** Maximum operation and placeholder child values processed by one DOM update. */
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
	/** Internal hydration-selected domain for an opaque operation authored before client creation. */
	componentDomain?: ComponentDomain;
	/** Explicit instrumented owner installed only when runtime inspection is built in. */
	inspection?: ExactRuntimeInspectionOwner;
};

/** Reports an observable dom profile event. */
export type DomProfileEvent = ExactProfileEvent<
	'dom',
	| 'render'
	| 'component-construct'
	| 'component-attach'
	| 'program-claim'
	| 'program-children'
	| 'program-bind'
>;
