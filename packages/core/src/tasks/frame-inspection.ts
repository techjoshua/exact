import type {
	ExactRuntimeInspectionEventKind,
	ExactTaskRuntimeSnapshot,
	ExactValuePreview
} from '@exactjs/devtools-protocol';
import type { ComponentInstance } from '../component/contracts.js';
import { componentDomainInspection } from '../component/domain.js';
import type { ExactRuntimeInspectionOwner } from '../component/inspection.js';
import {
	inspectRetainedTaskExecutions,
	recordInspectedTask
} from '../component/task-inspection-history.js';
import type { TaskFrameRecord } from './frame-runtime.js';
import {
	installTaskFrameInspectionCapability,
	type TaskFrameEventObservation
} from './frame-inspection-capability.js';
import { taskOwnerForHost } from './owner-hosts.js';

/** Immutable task-frame projection used by authorized runtime inspection. */
export type TaskFrameInspection = Readonly<{
	id: number;
	parentId?: number;
	parentGeneration?: number;
	parentSourceEntityId?: string;
	kind: string;
	label?: string;
	sourceEntityId?: string;
	activation: 'initialization' | 'reactive' | 'interaction' | 'invoked' | 'lifecycle';
	generation: number;
	placement: 'current' | 'client' | 'server';
	concurrency: 'parallel' | 'latest' | 'queue';
	priority: 'immediate' | 'normal' | 'deferred';
	readiness: 'blocking' | 'nonblocking';
	foreground: boolean;
	structuralPending: boolean;
	startedAt: number;
}>;

/** Returns active frame metadata without exposing mutable frame or owner internals. */
export function inspectTaskFramesForHost(host: object): readonly TaskFrameInspection[] {
	const owner = taskOwnerForHost(host);
	return owner ? Object.freeze([...owner.frames].map(inspectFrame)) : Object.freeze([]);
}

/** Returns active task snapshots for a component under an attached inspection owner. */
export function inspectTaskFrameSnapshotsForHost(
	host: ComponentInstance<any>,
	inspection: ExactRuntimeInspectionOwner
): readonly ExactTaskRuntimeSnapshot[] {
	return Object.freeze(
		inspectTaskFramesForHost(host).map((frame) =>
			taskFrameSnapshot(inspection, host, frame, 'running')
		)
	);
}

/** Captures arguments at frame entry only when an inspection session is attached. */
function recordTaskFrameStart(
	target: InspectedFrameTarget,
	frame: TaskFrameRecord,
	invocationArguments?: readonly unknown[]
): void {
	recordInspectedTask(
		target.inspection,
		target.host,
		taskFrameSnapshot(
			target.inspection,
			target.host,
			inspectFrame(frame),
			'running',
			invocationArguments === undefined
				? undefined
				: {
						arguments: target.inspection.preview(invocationArguments, taskPath(frame, 'arguments'))
					}
		)
	);
}

/** Replaces a live execution with its bounded result or failure preview at structural settlement. */
function recordTaskFrameOutcome(
	target: InspectedFrameTarget,
	frame: TaskFrameRecord,
	status: 'settled' | 'failed' | 'cancelled',
	value: unknown
): void {
	const previous = inspectRetainedTaskExecutions(target.inspection, target.host).find((task) =>
		taskSnapshotMatchesFrame(task, frame)
	);
	const outcome: TaskSnapshotOutcome =
		status === 'settled'
			? { result: target.inspection.preview(value, taskPath(frame, 'result')) }
			: { error: target.inspection.preview(value, taskPath(frame, 'error')) };
	recordInspectedTask(
		target.inspection,
		target.host,
		taskFrameSnapshot(target.inspection, target.host, inspectFrame(frame), status, {
			...(previous?.arguments ? { arguments: previous.arguments } : {}),
			...outcome
		})
	);
}

/** Publishes one frame transition when its durable host has inspection enabled. */
export function publishTaskFrameEvent(
	frame: TaskFrameRecord,
	kind: ExactRuntimeInspectionEventKind,
	reason?: unknown,
	observation?: TaskFrameEventObservation
): void {
	const target = inspectedFrameTarget(frame);
	if (!target) return;
	if (observation?.kind === 'start') recordTaskFrameStart(target, frame, observation.arguments);
	else if (observation?.kind === 'outcome')
		recordTaskFrameOutcome(target, frame, observation.status, observation.value);
	target.inspection.publish({
		kind,
		component: target.host,
		sourceEntityId: frameSourceEntityId(frame),
		generation: frame.generation,
		...(reason === undefined ? {} : { reason: String(reason) })
	});
}

/** Returns whether this frame's component domain currently has an attached inspection session. */
export function taskFrameInspectionAttached(frame: TaskFrameRecord): boolean {
	return inspectedFrameTarget(frame) !== undefined;
}

type InspectedFrameTarget = Readonly<{
	host: ComponentInstance<any>;
	inspection: ExactRuntimeInspectionOwner;
}>;

type TaskSnapshotOutcome = Readonly<{
	arguments?: ExactValuePreview;
	result?: ExactValuePreview;
	error?: ExactValuePreview;
}>;

function taskFrameSnapshot(
	owner: ExactRuntimeInspectionOwner,
	component: ComponentInstance<any>,
	frame: TaskFrameInspection,
	status: ExactTaskRuntimeSnapshot['status'],
	outcome: TaskSnapshotOutcome = {}
): ExactTaskRuntimeSnapshot {
	const settled = status !== 'running';
	return Object.freeze({
		id: owner.identity(component, {
			sourceEntityId: frame.sourceEntityId ?? `runtime-task-frame:${frame.id}`,
			generation: frame.generation
		})!,
		...(frame.parentId === undefined
			? {}
			: {
					parent: owner.identity(component, {
						sourceEntityId: frame.parentSourceEntityId ?? `runtime-task-frame:${frame.parentId}`,
						generation: frame.parentGeneration
					})!
				}),
		...(frame.label === undefined ? {} : { name: frame.label }),
		kind: frame.kind,
		activation: frame.activation,
		placement: frame.placement === 'current' ? 'isomorphic' : frame.placement,
		readiness: frame.readiness,
		priority: frame.priority,
		concurrency: frame.concurrency,
		status,
		generation: frame.generation,
		pending: settled ? 0 : frame.foreground ? 1 : 0,
		foreground: settled ? false : frame.foreground,
		structuralPending: settled ? false : frame.structuralPending,
		optimistic: false,
		...(status === 'settled' ? { completedGeneration: frame.generation } : {}),
		...(status === 'failed' ? { failedGeneration: frame.generation } : {}),
		startedAt: frame.startedAt,
		...(settled ? { settledAt: monotonicTimestamp() } : {}),
		...outcome
	});
}

function inspectFrame(frame: TaskFrameRecord): TaskFrameInspection {
	return Object.freeze({
		id: frame.id,
		...(frame.parent
			? {
					parentId: frame.parent.id,
					parentGeneration: frame.parent.generation,
					...(frame.parent.sourceEntityId
						? { parentSourceEntityId: frame.parent.sourceEntityId }
						: {})
				}
			: {}),
		kind: frame.kind,
		...(frame.label === undefined ? {} : { label: frame.label }),
		...(frame.sourceEntityId === undefined ? {} : { sourceEntityId: frame.sourceEntityId }),
		activation: frame.activation,
		generation: frame.generation,
		placement: frame.placement,
		concurrency: frame.concurrency,
		priority: frame.priority,
		readiness: frame.readiness,
		foreground: frame.readiness === 'blocking' && frame.priority !== 'deferred',
		structuralPending: !frame.settled,
		startedAt: frame.startedAt
	});
}

function inspectedFrameTarget(frame: TaskFrameRecord): InspectedFrameTarget | undefined {
	const host = frame.owner.host as ComponentInstance<any> | undefined;
	const inspection = host?.domain ? componentDomainInspection(host.domain) : undefined;
	return host && inspection?.attached ? { host, inspection } : undefined;
}

function taskSnapshotMatchesFrame(task: ExactTaskRuntimeSnapshot, frame: TaskFrameRecord): boolean {
	return (
		task.generation === frame.generation && task.id.sourceEntityId === frameSourceEntityId(frame)
	);
}

function frameSourceEntityId(frame: TaskFrameRecord): string {
	return frame.sourceEntityId ?? `runtime-task-frame:${frame.id}`;
}

function taskPath(frame: TaskFrameRecord, field: string): readonly string[] {
	return ['task', frameSourceEntityId(frame), String(frame.generation), field];
}

function monotonicTimestamp(): number {
	return globalThis.performance?.now() ?? Date.now();
}

/** Activates the full task diagnostic path only for builds that construct an inspection owner. */
export function activateTaskFrameInspection(): void {
	installTaskFrameInspectionCapability({
		publish: publishTaskFrameEvent,
		attached: taskFrameInspectionAttached
	});
}
