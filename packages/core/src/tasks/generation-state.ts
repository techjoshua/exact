import { reactiveObjects } from '@exactjs/reactive/framework/objects';
import type { TaskDefinition } from './definition-record.js';
import type { TaskOwnerRecord } from './frame-contracts.js';
import type {
	InternalTaskGeneration,
	InternalTaskLane,
	InternalTaskOwnerState
} from './runtime-types.js';

/** Selects the durable owner state, allocating its reactive status storage once. */
export function ownerState<Args extends unknown[], Result>(
	definition: TaskDefinition<Args, Result>,
	owner: TaskOwnerRecord
): InternalTaskOwnerState<Result> {
	let state = definition.owners.get(owner);
	if (!state) {
		state = reactiveObjects<InternalTaskOwnerState<Result>>(
			{
				nextGeneration: 0,
				generation: 0,
				pendingCount: 0,
				result: undefined,
				error: undefined,
				lanes: new Map(),
				lanesVersion: 0
			},
			{ passthroughKeys: ['lanes'] }
		);
		definition.owners.set(owner, state);
	}
	return state;
}

/** Selects an owner lane by its existing concurrency key, allocating on first use. */
export function taskLane<Result>(
	state: InternalTaskOwnerState<Result>,
	key: unknown
): InternalTaskLane<Result> {
	let lane = state.lanes.get(key);
	if (!lane) {
		lane = reactiveObjects<InternalTaskLane<Result>>(
			{
				key,
				active: new Set<InternalTaskGeneration<Result>>(),
				queue: [] as InternalTaskGeneration<Result>[],
				pendingCount: 0,
				generation: 0,
				result: undefined,
				error: undefined
			},
			{ passthroughKeys: ['active', 'queue'] }
		);
		state.lanes.set(key, lane);
		state.lanesVersion++;
	}
	return lane;
}
