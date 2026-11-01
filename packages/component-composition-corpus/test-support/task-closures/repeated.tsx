import { TaskContext, type Component } from '@exactjs/core';
export const trace: unknown[] = [];
export const cleaned: number[] = [];
export function Page(this: Component<{ n: number }>) {
	this.state.n = 0;
	async function run(value: number, task: TaskContext = TaskContext.server().blocking()) {
		const owner = this;
		const before = owner.state.n;
		task.cleanup(() => {
			cleaned.push(value);
		});
		const calls = {
			put() {
				owner.state.n = before + value;
				trace.push(value, before, owner.state.n);
				return owner.state.n;
			}
		};
		return calls.put();
	}
	run(1);
	run(2);
	return () => <button onClick={() => run(3)}>run</button>;
}
