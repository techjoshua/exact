import type { ExactRuntimeInspectionEventKind } from '@exactjs/devtools-protocol';
import type { ComponentInstance } from '../component/contracts.js';
import { componentDomainInspection } from '../component/domain.js';
import type { TaskFrameRecord } from './frame-runtime.js';
import { taskOwnerForHost } from './owner-hosts.js';

/** Immutable task-frame projection used by authorized runtime inspection. */
export type TaskFrameInspection = Readonly<{
	id: number;
	parentId?: number;
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
	if (!owner) return Object.freeze([]);
	return Object.freeze(
		[...owner.frames].map((frame) =>
			Object.freeze({
				id: frame.id,
				...(frame.parent ? { parentId: frame.parent.id } : {}),
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
			})
		)
	);
}

/** Publishes one frame transition when its durable host has inspection enabled. */
export function publishTaskFrameEvent(
	frame: TaskFrameRecord,
	kind: ExactRuntimeInspectionEventKind,
	reason?: unknown
): void {
	const host = frame.owner.host as ComponentInstance<any> | undefined;
	const inspection = host?.domain ? componentDomainInspection(host.domain) : undefined;
	if (!host || !inspection) return;
	inspection.publish({
		kind,
		component: host,
		sourceEntityId: frame.sourceEntityId ?? `runtime-task-frame:${frame.id}`,
		generation: frame.generation,
		...(reason === undefined ? {} : { reason: String(reason) })
	});
}
