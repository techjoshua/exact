import type { TaskActivation, TaskContext, TaskOwner } from './contracts.js';
import type { TaskFunction } from './contracts.js';

/** Brands internal task frame records without exposing their representation publicly. */
export const taskFrameTokenBrand = Symbol('exact.task-frame-token');
/** Brands durable task owners shared by compiler-authored and compilerless tasks. */
export const taskOwnerBrand = Symbol.for('@exactjs/task-owner');
/** Releases one resource owned by a task frame, synchronously or asynchronously. */
export type TaskFrameCleanup = () => void | Promise<void>;

/** Deferred setup activation held while a durable host restores SSR state. */
export type TaskActivationRegistration = {
	readonly task: TaskFunction<any[], unknown>;
	settled: boolean;
	start(skipInitial: boolean): void;
};

/** Internal durable owner representation shared by the task ABI and framework SPI. */
export type TaskOwnerRecord = TaskOwner & {
	readonly [taskOwnerBrand]: true;
	readonly label?: string;
	readonly frames: Set<TaskFrameRecord>;
	readonly settlements: Set<PromiseLike<unknown>>;
	readonly ownerCleanups: Set<TaskFrameCleanup>;
	readonly activationRegistrations: Set<TaskActivationRegistration>;
	readonly controller: AbortController;
	host?: object;
	observeSettlement?: (settlement: Promise<unknown>) => void;
	runTask?: <T>(work: () => Promise<T>) => Promise<T>;
	registerReadiness?: (
		taskGeneration: number,
		settlement: PromiseLike<unknown>,
		commit: () => void,
		discard: () => void
	) => { cancel(): void };
	activationsDeferred: boolean;
	disposed: boolean;
};

/** Internal opaque frame token implementation. */
export type TaskFrameRecord = {
	readonly [taskFrameTokenBrand]: true;
	readonly id: number;
	readonly owner: TaskOwnerRecord;
	readonly parent?: TaskFrameRecord;
	readonly controller: AbortController;
	children?: Set<Promise<void>>;
	cleanups?: TaskFrameCleanup[];
	readonly context?: TaskContext;
	readonly kind: string;
	readonly label?: string;
	readonly sourceEntityId?: string;
	readonly activation: TaskActivation;
	readonly generation: number;
	readonly placement: 'current' | 'client' | 'server';
	readonly concurrency: 'parallel' | 'latest' | 'queue';
	readonly priority: 'immediate' | 'normal' | 'deferred';
	readonly readiness: 'blocking' | 'nonblocking';
	readonly startedAt: number;
	producerOpen: boolean;
	settled: boolean;
};

/** Internal options used to create a task frame. */
export type InternalTaskFrameOptions = {
	readonly parent?: TaskFrameRecord;
	readonly owner?: TaskOwnerRecord;
	readonly controller?: AbortController;
	readonly generation?: number;
	readonly activation?: TaskActivation;
	readonly detached?: boolean;
	readonly priority?: 'immediate' | 'normal' | 'deferred';
	readonly readiness?: 'blocking' | 'nonblocking';
	readonly optimistic?: (work: () => void) => void;
	readonly kind?: string;
	readonly label?: string;
	readonly sourceEntityId?: string;
	readonly placement?: 'current' | 'client' | 'server';
	readonly concurrency?: 'parallel' | 'latest' | 'queue';
	/** Invocation arguments exposed only as a bounded preview while inspection is attached. */
	readonly inspectionArguments?: readonly unknown[];
	/** Whether a failed child contributes structural failure to its parent. */
	readonly propagateFailure?: () => boolean;
	/** Confirms that the caller atomically reserved this parent before scheduling. */
	readonly parentReserved?: boolean;
	/** Omits the public TaskContext for internal hosts whose callback cannot observe it. */
	readonly publicContext?: false;
};
