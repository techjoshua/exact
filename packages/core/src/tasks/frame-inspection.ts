import { taskOwnerForHost } from './owner-hosts.js';

/** Immutable task-frame projection used by authorized runtime inspection. */
export type TaskFrameInspection = Readonly<{
	id: number;
	parentId?: number;
	label?: string;
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
				...(frame.label === undefined ? {} : { label: frame.label }),
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
