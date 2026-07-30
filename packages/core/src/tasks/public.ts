import { TaskContext as taskContextPolicy } from './policy.js';
import type { TaskContext as TaskContextContract } from './contracts.js';

/** Compiler-recognized task policy builder value. */
export const TaskContext = taskContextPolicy;
/** Capabilities scoped to one runtime task frame. */
export type TaskContext = TaskContextContract;
