import { TaskContext, type Component } from '@exactjs/core';
import { result } from './activity-task-control.js';
/** Compiler-backed task whose result can arrive while its Activity is parked. */
export function CompiledPanel(this: Component<{ value: string }>) {
	this.state.value = 'base';
	const state = this.state;
	async function load(task: TaskContext = TaskContext.client().latest()) {
		void task;
		state.value = await result();
	}
	this.onMount(() => load());
	return () => <p>{this.state.value}</p>;
}
