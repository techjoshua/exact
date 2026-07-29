import type { ExactInspectionRuntimeId } from './identity.js';
import type { ExactValuePreview } from './value-preview.js';

/** Public, redaction-safe context observation. */
export type ExactContextPreview = Readonly<{
	name: string;
	scope: 'component' | 'request' | 'application';
	availability: 'value' | 'resource' | 'secret' | 'unavailable';
	value?: ExactValuePreview;
	secretName?: string;
	type?: string;
}>;

/** Current state of one component-owned task generation. */
export type ExactTaskRuntimeSnapshot = Readonly<{
	id: ExactInspectionRuntimeId;
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	readiness: 'blocking' | 'nonblocking';
	priority: 'normal' | 'deferred';
	status: 'idle' | 'queued' | 'running' | 'settled' | 'failed' | 'cancelled' | 'stale';
	generation: number;
	completedGeneration?: number;
	failedGeneration?: number;
	cancellationReason?: string;
	startedAt?: number;
	settledAt?: number;
}>;

/** Current state of one named component action without its callback or captures. */
export type ExactActionRuntimeSnapshot = Readonly<{
	id: ExactInspectionRuntimeId;
	name: string;
	placement: 'client' | 'server' | 'isomorphic';
	priority: 'normal' | 'deferred';
	concurrency: 'parallel' | 'latest' | 'queue';
	status: 'idle' | 'queued' | 'running' | 'settled' | 'failed' | 'cancelled' | 'stale';
	generation: number;
	pending: number;
	optimistic: boolean;
	startedAt?: number;
	settledAt?: number;
}>;

/** Activity ownership and readiness status for a retained component range. */
export type ExactActivityInspection = Readonly<{
	mode: 'active' | 'parked' | 'background';
	detached: boolean;
	pending: number;
	generation: number;
}>;

/** Suspense candidate and reveal status for a component range. */
export type ExactSuspenseInspection = Readonly<{
	pending: number;
	generation: number;
	revealed: boolean;
	hasCandidate: boolean;
}>;

/** Redaction-safe snapshot of one durable component instance. */
export type ExactInspectedRuntimeComponent = Readonly<{
	id: ExactInspectionRuntimeId;
	parent?: ExactInspectionRuntimeId;
	name: string;
	status: 'constructing' | 'mounted' | 'inactive' | 'unmounting';
	props: ExactValuePreview;
	state: ExactValuePreview;
	contexts: readonly ExactContextPreview[];
	tasks: readonly ExactTaskRuntimeSnapshot[];
	actions: readonly ExactActionRuntimeSnapshot[];
	activity?: ExactActivityInspection;
	suspense?: ExactSuspenseInspection;
	ownedElements: number;
}>;

/** One active client or server execution root. */
export type ExactInspectionExecutionRoot = Readonly<{
	side: 'client' | 'server';
	binding?: string;
	buildKey: string;
	executionRoot: string;
	status: 'available' | 'partial' | 'unavailable';
	unavailableReason?: string;
	components: number;
}>;

/** Authorized inspection session metadata returned to consumers. */
export type ExactInspectionSessionDescription = Readonly<{
	id: string;
	protocol: 1;
	openedAt: number;
	expiresAt: number;
	capabilities: readonly ExactDebugCapability[];
}>;

/** Independently authorized server capability. */
export type ExactDebugCapability = 'catalog' | 'snapshot' | 'events' | 'source';

/** Initial bounded snapshot assembled after a consumer attaches. */
export type ExactInspectionSnapshot = Readonly<{
	protocol: 1;
	session: ExactInspectionSessionDescription;
	roots: readonly ExactInspectionExecutionRoot[];
	components: readonly ExactInspectedRuntimeComponent[];
	timelineCursor: string;
}>;

/** Observation kinds shared by client and server runtime sinks. */
export type ExactRuntimeInspectionEventKind =
	| 'component.construct'
	| 'component.mount'
	| 'component.activate'
	| 'component.deactivate'
	| 'component.unmount'
	| 'state.change'
	| 'props.change'
	| 'task.queue'
	| 'task.start'
	| 'task.settle'
	| 'task.fail'
	| 'task.cancel'
	| 'task.supersede'
	| 'action.queue'
	| 'action.start'
	| 'action.optimistic'
	| 'action.rollback'
	| 'action.discard'
	| 'action.settle'
	| 'action.cancel'
	| 'render.invalidate'
	| 'binding.invalidate'
	| 'activity.change'
	| 'suspense.change'
	| 'continuation.dispatch'
	| 'continuation.receive'
	| 'continuation.execute'
	| 'continuation.respond'
	| 'continuation.apply'
	| 'context.access'
	| 'hydration.activate'
	| 'resumption.activate'
	| 'patch.apply'
	| 'interaction'
	| 'navigation'
	| 'error'
	| 'profile';

/** Immutable bounded event produced synchronously without retaining runtime objects. */
export type ExactRuntimeInspectionEvent = Readonly<{
	protocol: 1;
	cursor: string;
	sequence: number;
	timestamp: number;
	wallTime?: number;
	kind: ExactRuntimeInspectionEventKind;
	id: ExactInspectionRuntimeId;
	requestId?: string;
	interactionId?: string;
	path?: string;
	reason?: string;
	preview?: ExactValuePreview;
	attributes?: Readonly<Record<string, string | number | boolean | null>>;
}>;

/** Explicit sink inherited from a runtime owner; it never changes scheduling. */
export interface ExactRuntimeInspectionSink {
	publish(event: ExactRuntimeInspectionEvent): void;
}

/** Browser-visible microfrontend availability and retained-build status. */
export type ExactInspectedMicrofrontend = Readonly<{
	binding: string;
	buildKey: string;
	executionRoots: readonly string[];
	mounted: boolean;
	clientStatus: 'available' | 'unavailable';
	serverStatus: 'available' | 'disabled' | 'unauthorized' | 'retired' | 'disconnected';
	preferredBuildKey?: string;
	eventStream: 'connected' | 'disconnected' | 'not-authorized';
}>;
