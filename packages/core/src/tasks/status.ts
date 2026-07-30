import type { TaskStatus } from './contracts.js';
import type { InternalTaskLane, InternalTaskOwnerState } from './runtime.js';

/** Creates a reactive status projection over an owner and optional lane key. */
export function createTaskStatus<Result>(
	state: InternalTaskOwnerState<Result>,
	key: unknown,
	cancel: (lane: InternalTaskLane<Result>, reason: unknown) => void
): TaskStatus<Result> {
	const lanes = () =>
		key === undefined ? [...state.lanes.values()] : [state.lanes.get(key)].filter(Boolean);
	const keyed = () => (key === undefined ? undefined : state.lanes.get(key));
	return {
		get pending() {
			return (keyed()?.pendingCount ?? state.pendingCount) > 0;
		},
		get pendingCount() {
			return keyed()?.pendingCount ?? state.pendingCount;
		},
		get generation() {
			return keyed()?.generation ?? state.generation;
		},
		get result() {
			return keyed()?.result ?? state.result;
		},
		get error() {
			return keyed()?.error ?? state.error;
		},
		cancel(reason = 'cancelled') {
			for (const lane of lanes()) if (lane) cancel(lane, reason);
		}
	};
}

/** Defines status accessors on an owner-bound callable facade. */
export function defineTaskStatusProperties<Result>(
	target: object,
	status: TaskStatus<Result>
): void {
	for (const property of ['pending', 'pendingCount', 'generation', 'result', 'error'] as const)
		Object.defineProperty(target, property, {
			enumerable: true,
			get: () => status[property]
		});
	Object.defineProperty(target, 'cancel', { value: status.cancel.bind(status) });
}
