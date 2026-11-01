import { TaskContext, type Component } from '@exactjs/core';
const key: unique symbol = Symbol('entry');
export function Probe(this: Component<{ [key]: number }>) {
	this.state[key] = 0;
	const run = async (task: TaskContext = TaskContext.client().latest()) => {
		void task;
		await Promise.resolve();
		this.state[key] += 1;
	};
	return () => <button onClick={() => run()} />;
}
