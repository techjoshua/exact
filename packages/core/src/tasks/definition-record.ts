import type { RuntimeTaskOptions, TaskContext } from './contracts.js';
import type { TaskOwnerRecord } from './frame-contracts.js';
import type { InternalTaskOwnerState } from './runtime-types.js';

/** Connects task facades to their stable definition across compatible provider copies. */
export const taskDefinitionBrand = Symbol.for('@exactjs/task-definition/abi-2');

/** Stable task definition shared by every owner-specific runtime state. */
export type TaskDefinition<Args extends unknown[], Result> = {
	readonly [taskDefinitionBrand]: true;
	readonly options: RuntimeTaskOptions<Args>;
	readonly implementation: (...args: [...Args, TaskContext]) => Result | Promise<Result>;
	readonly sourceEntityId?: string;
	readonly owners: WeakMap<TaskOwnerRecord, InternalTaskOwnerState<Result>>;
};
