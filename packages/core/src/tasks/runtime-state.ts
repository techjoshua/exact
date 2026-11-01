const taskRuntimeKey = Symbol.for('@exactjs/task-runtime/abi-2');
const host = globalThis as typeof globalThis & { [taskRuntimeKey]?: Map<string, unknown> };
const states = (host[taskRuntimeKey] ??= new Map<string, unknown>());

/** Shares one task-domain state cell between compatible runtime copies in the same realm. The synchronous initializer runs once. Identity-bound entries remain weak inside their owning cell, and task generations keep their own signals and lifetimes. */
export function sharedTaskRuntimeState<State>(name: string, initialize: () => State): State {
	if (states.has(name)) return states.get(name) as State;
	const state = initialize();
	states.set(name, state);
	return state;
}
