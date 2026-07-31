import type { TaskStatus } from './contracts.js';
import type { InternalTaskLane, InternalTaskOwnerState } from './runtime.js';

/** Creates a reactive status projection over an owner and optional lane key. */
export function createTaskStatus<Result>(
	state: InternalTaskOwnerState<Result>,
	key: unknown,
	cancel: (lane: InternalTaskLane<Result>, reason: unknown) => void
): TaskStatus<Result> {
	const aggregate = key === undefined;
	const lane = () => (aggregate ? undefined : state.lanes.get(key));
	const lanes = () =>
		aggregate ? [...state.lanes.values()] : [state.lanes.get(key)].filter(Boolean);
	return {
		get pending() {
			return (aggregate ? state.pendingCount : (lane()?.pendingCount ?? 0)) > 0;
		},
		get pendingCount() {
			return aggregate ? state.pendingCount : (lane()?.pendingCount ?? 0);
		},
		get generation() {
			return aggregate ? state.generation : (lane()?.generation ?? 0);
		},
		get result() {
			return aggregate ? state.result : lane()?.result;
		},
		get error() {
			return aggregate ? state.error : lane()?.error;
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
