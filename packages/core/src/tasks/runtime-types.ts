import type { ReactiveMutationJournal } from '@exactjs/reactive';

import type { TaskActivation } from './contracts.js';
import type { TaskFrameRecord } from './frame-runtime.js';

/** Mutable execution record for one owner- and lane-scoped task generation. */
export type InternalTaskGeneration<Result> = {
	readonly generation: number;
	readonly controller: AbortController;
	readonly args: readonly unknown[];
	readonly journals: ReactiveMutationJournal[];
	readonly promise: Promise<Result>;
	readonly resolve: (value: Result) => void;
	readonly reject: (error: unknown) => void;
	readonly parent: TaskFrameRecord | undefined;
	readonly releaseReservation?: () => void;
	readonly foreground: boolean;
	readonly activation: TaskActivation;
	/** Effective lane policy; dependency-driven activation always uses latest-wins. */
	readonly concurrency: 'parallel' | 'latest' | 'queue';
	readonly readiness: 'blocking' | 'nonblocking';
	readinessRegistration?: { cancel(): void };
	priority: 'immediate' | 'normal' | 'deferred';
	scheduledWork?: () => void;
	observed: boolean;
	started: boolean;
	executing: boolean;
};

/** Concurrency lane state shared by generations with the same task key. */
export type InternalTaskLane<Result> = {
	readonly key: unknown;
	readonly active: Set<InternalTaskGeneration<Result>>;
	readonly queue: InternalTaskGeneration<Result>[];
	pendingCount: number;
	generation: number;
	result: Result | undefined;
	error: unknown;
};

/** Aggregate status and keyed lanes for one task definition under one owner. */
export type InternalTaskOwnerState<Result> = {
	nextGeneration: number;
	generation: number;
	pendingCount: number;
	result: Result | undefined;
	error: unknown;
	readonly lanes: Map<unknown, InternalTaskLane<Result>>;
};
