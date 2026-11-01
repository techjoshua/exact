import { TaskContext, type Component } from '@exactjs/core';
export function Page(this: Component<{ n: number }>) {
	this.state.n = 0;
	const owner = this;
	const calls = {
		run() {
			owner.state.n += 1;
		}
	};
	async function run(task: TaskContext = TaskContext.server().blocking()) {
		void task;
		calls.run();
	}
	run();
	return () => this.state.n;
}
