import type { Reactive } from '@exactjs/reactive';
import { componentContinuationTaskId } from '../task/continuation.js';
import type {
	ComponentInstance,
	ComponentResumptionActivation,
	TaskRegistration
} from './contracts.js';

/** Applies compiler-selected SSR state paths without replacing client-local setup state. */
export function applyComponentResumption(
	state: Reactive<Record<string, unknown>>,
	resumption: ComponentResumptionActivation
): void {
	for (const [path, value] of Object.entries(resumption.values)) writePath(state, path, value);
}

/** Starts deferred tasks, arming successfully settled SSR continuations for future changes. */
export function startResumedComponentTasks(
	instance: ComponentInstance<any>,
	resumption: ComponentResumptionActivation
): void {
	const settled = new Set(resumption.settledContinuations);
	for (const task of instance.tasks) {
		const continuationId = componentContinuationTaskId(task.work);
		if (continuationId && settled.has(continuationId)) task.resume();
		else task.run();
	}
}

/** Starts a task immediately unless component construction is restoring an SSR activation. */
export function startRegisteredTask(
	task: TaskRegistration,
	resumption: ComponentResumptionActivation | undefined
): void {
	if (!resumption) task.run();
}

/** Materializes one validated dotted state path into the live reactive state object. */
function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
	const segments = path.split('.');
	if (!segments.length || !segments.every(safeSegment)) {
		throw new Error(`Malformed eXact component resumption state path ${path}`);
	}
	let cursor = target;
	for (const segment of segments.slice(0, -1)) {
		const current = cursor[segment];
		if (current && typeof current === 'object' && !Array.isArray(current)) {
			cursor = current as Record<string, unknown>;
		} else {
			const created: Record<string, unknown> = {};
			cursor[segment] = created;
			cursor = created;
		}
	}
	cursor[segments.at(-1)!] = value;
}

/** Rejects prototype-bearing path segments before touching reactive state. */
function safeSegment(segment: string): boolean {
	return (
		segment.length > 0 &&
		segment !== '__proto__' &&
		segment !== 'prototype' &&
		segment !== 'constructor'
	);
}
