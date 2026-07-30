import { isExactInspectionRuntimeId, type ExactInspectionRuntimeId } from './identity.js';
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

/** Current redaction-safe state of one task definition or generation in its structural tree. */
export type ExactTaskRuntimeSnapshot = Readonly<{
	id: ExactInspectionRuntimeId;
	parent?: ExactInspectionRuntimeId;
	name?: string;
	activation: 'initialization' | 'reactive' | 'interaction' | 'invoked' | 'lifecycle';
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	readiness: 'blocking' | 'nonblocking';
	priority: 'immediate' | 'normal' | 'deferred';
	concurrency: 'parallel' | 'latest' | 'queue';
	status: 'idle' | 'queued' | 'running' | 'settled' | 'failed' | 'cancelled' | 'stale';
	generation: number;
	pending: number;
	foreground: boolean;
	structuralPending: boolean;
	optimistic: boolean;
	completedGeneration?: number;
	failedGeneration?: number;
	cancellationReason?: string;
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
	| 'task.optimistic'
	| 'task.rollback'
	| 'task.commit'
	| 'task.frame.enter'
	| 'task.frame.exit'
	| 'task.foreground-settle'
	| 'task.structural-settle'
	| 'task.resource.acquire'
	| 'task.resource.release'
	| 'task.renderer.commit'
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

const inspectionEventKinds = new Set<ExactRuntimeInspectionEventKind>([
	'component.construct',
	'component.mount',
	'component.activate',
	'component.deactivate',
	'component.unmount',
	'state.change',
	'props.change',
	'task.queue',
	'task.start',
	'task.settle',
	'task.fail',
	'task.cancel',
	'task.supersede',
	'task.optimistic',
	'task.rollback',
	'task.commit',
	'task.frame.enter',
	'task.frame.exit',
	'task.foreground-settle',
	'task.structural-settle',
	'task.resource.acquire',
	'task.resource.release',
	'task.renderer.commit',
	'render.invalidate',
	'binding.invalidate',
	'activity.change',
	'suspense.change',
	'continuation.dispatch',
	'continuation.receive',
	'continuation.execute',
	'continuation.respond',
	'continuation.apply',
	'context.access',
	'hydration.activate',
	'resumption.activate',
	'patch.apply',
	'interaction',
	'navigation',
	'error',
	'profile'
]);

/** Validates one untrusted event before extension or CDP delivery. */
export function isExactRuntimeInspectionEvent(
	value: unknown
): value is ExactRuntimeInspectionEvent {
	if (
		!record(value) ||
		value.protocol !== 1 ||
		!boundedString(value.cursor, 256) ||
		!positiveInteger(value.sequence) ||
		typeof value.timestamp !== 'number' ||
		!Number.isFinite(value.timestamp) ||
		(value.wallTime !== undefined &&
			(typeof value.wallTime !== 'number' || !Number.isFinite(value.wallTime))) ||
		!inspectionEventKinds.has(value.kind) ||
		!isExactInspectionRuntimeId(value.id)
	)
		return false;
	for (const key of ['requestId', 'interactionId', 'path', 'reason'] as const)
		if (value[key] !== undefined && !boundedString(value[key], key === 'path' ? 2048 : 1024))
			return false;
	if (value.attributes !== undefined) {
		if (!record(value.attributes) || Object.keys(value.attributes).length > 100) return false;
		for (const [key, attribute] of Object.entries(value.attributes))
			if (
				key.length > 256 ||
				!(
					attribute === null ||
					typeof attribute === 'string' ||
					typeof attribute === 'boolean' ||
					(typeof attribute === 'number' && Number.isFinite(attribute))
				) ||
				(typeof attribute === 'string' && attribute.length > 4_096)
			)
				return false;
	}
	return value.preview === undefined || validPreview(value.preview, 0);
}

function validPreview(value: unknown, depth: number): boolean {
	if (depth > 20 || !record(value) || typeof value.kind !== 'string') return false;
	if (value.kind === 'scalar')
		return (
			value.value === null ||
			typeof value.value === 'boolean' ||
			(typeof value.value === 'number' && Number.isFinite(value.value)) ||
			(typeof value.value === 'string' && value.value.length <= 100_000)
		);
	if (value.kind === 'redacted')
		return ['secret', 'server-resource', 'policy'].includes(value.reason);
	if (value.kind === 'unavailable') return boundedString(value.reason, 1024);
	if (value.kind === 'function') return value.name === undefined || boundedString(value.name, 128);
	if (value.kind === 'dom')
		return (
			boundedString(value.tag, 64) &&
			(value.id === undefined || boundedString(value.id, 128)) &&
			Array.isArray(value.classes) &&
			value.classes.length <= 10 &&
			value.classes.every((item: unknown) => boundedString(item, 128))
		);
	return (
		value.kind === 'object' &&
		boundedString(value.type, 256) &&
		typeof value.truncated === 'boolean' &&
		Array.isArray(value.entries) &&
		value.entries.length <= 10_000 &&
		value.entries.every(
			(entry: unknown) =>
				record(entry) && boundedString(entry.key, 512) && validPreview(entry.value, depth + 1)
		)
	);
}

function boundedString(value: unknown, maximum: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function positiveInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) > 0;
}

function record(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
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
