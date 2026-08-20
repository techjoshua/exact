import type { ExactTaskRuntimeSnapshot } from '@exactjs/devtools-protocol';
import type { AnyComponentInstance } from './contracts.js';
import type { ExactRuntimeInspectionOwner } from './inspection.js';

type RetainedTaskExecution = Readonly<{
	key: string;
	componentId: string;
	snapshot: ExactTaskRuntimeSnapshot;
}>;

/** Default maximum number of completed or active task executions retained per inspection owner. */
const defaultTaskInspectionHistoryLimit = 200;
const taskHistories = new WeakMap<ExactRuntimeInspectionOwner, TaskInspectionHistory>();

/**
 * Retains only immutable, redaction-safe task projections for the current inspection session.
 *
 * The global bound applies across every component in the owner. Updating an existing execution
 * does not consume another slot, and clearing the session releases every retained preview.
 */
export class TaskInspectionHistory {
	readonly #limit: number;
	readonly #records = new Map<string, RetainedTaskExecution>();
	readonly #order: string[] = [];

	constructor(limit = defaultTaskInspectionHistoryLimit) {
		this.#limit = normalizeLimit(limit);
	}

	/** Adds or replaces one execution without retaining application-owned values. */
	record(component: AnyComponentInstance, snapshot: ExactTaskRuntimeSnapshot): void {
		const key = taskExecutionKey(snapshot);
		const existing = this.#records.get(key);
		if (!existing && this.#records.size >= this.#limit) {
			const oldestKey = this.#oldestKey();
			const oldest = oldestKey === undefined ? undefined : this.#records.get(oldestKey);
			if (oldest && compareTaskRecency(snapshot, oldest.snapshot) <= 0) return;
			if (oldestKey !== undefined) {
				this.#records.delete(oldestKey);
				this.#order.splice(this.#order.indexOf(oldestKey), 1);
			}
		}
		this.#records.set(key, Object.freeze({ key, componentId: component.id, snapshot }));
		if (!existing) this.#order.push(key);
	}

	/** Returns newest-first executions for one live component. */
	list(component: AnyComponentInstance): readonly ExactTaskRuntimeSnapshot[] {
		const snapshots: ExactTaskRuntimeSnapshot[] = [];
		for (let index = this.#order.length - 1; index >= 0; index--) {
			const record = this.#records.get(this.#order[index]!);
			if (record?.componentId === component.id) snapshots.push(record.snapshot);
		}
		return Object.freeze(snapshots);
	}

	/** Releases all execution previews owned by the inspection session. */
	clear(): void {
		this.#records.clear();
		this.#order.length = 0;
	}

	/** Releases execution previews for an unmounted component. */
	deleteComponent(component: AnyComponentInstance): void {
		for (let index = this.#order.length - 1; index >= 0; index--) {
			const key = this.#order[index]!;
			if (this.#records.get(key)?.componentId !== component.id) continue;
			this.#records.delete(key);
			this.#order.splice(index, 1);
		}
	}

	/** Selects the least-recent retained start so late settlement cannot displace newer work. */
	#oldestKey(): string | undefined {
		let oldestKey: string | undefined;
		for (const key of this.#order) {
			const candidate = this.#records.get(key)?.snapshot;
			const oldest = oldestKey === undefined ? undefined : this.#records.get(oldestKey)?.snapshot;
			if (candidate && (!oldest || compareTaskRecency(candidate, oldest) < 0)) oldestKey = key;
		}
		return oldestKey;
	}
}

/** Associates an inspection owner with the session history controlled by its attach lifecycle. */
export function registerTaskInspectionHistory(
	owner: ExactRuntimeInspectionOwner,
	history: TaskInspectionHistory
): void {
	taskHistories.set(owner, history);
}

/** Releases the task history association when its inspection session detaches. */
export function releaseTaskInspectionHistory(owner: ExactRuntimeInspectionOwner): void {
	taskHistories.delete(owner);
}

/** Retains one immutable, preview-only task execution for an attached internal owner. */
export function recordInspectedTask(
	owner: ExactRuntimeInspectionOwner,
	component: AnyComponentInstance,
	task: ExactTaskRuntimeSnapshot
): void {
	if (owner.attached) taskHistories.get(owner)?.record(component, task);
}

/** Returns bounded newest-first task history without exposing the mutable history store. */
export function inspectRetainedTaskExecutions(
	owner: ExactRuntimeInspectionOwner,
	component: AnyComponentInstance
): readonly ExactTaskRuntimeSnapshot[] {
	return owner.attached
		? (taskHistories.get(owner)?.list(component) ?? Object.freeze([]))
		: Object.freeze([]);
}

function taskExecutionKey(snapshot: ExactTaskRuntimeSnapshot): string {
	const id = snapshot.id;
	return `${id.sessionId}\u0000${id.side}\u0000${id.binding ?? ''}\u0000${id.buildKey}\u0000${id.executionRoot}\u0000${id.instanceId}\u0000${id.sourceEntityId ?? ''}\u0000${snapshot.generation}`;
}

function normalizeLimit(value: number): number {
	return Number.isSafeInteger(value) && value > 0
		? Math.min(value, 10_000)
		: defaultTaskInspectionHistoryLimit;
}

function compareTaskRecency(
	left: ExactTaskRuntimeSnapshot,
	right: ExactTaskRuntimeSnapshot
): number {
	return (left.startedAt ?? 0) - (right.startedAt ?? 0) || left.generation - right.generation;
}
