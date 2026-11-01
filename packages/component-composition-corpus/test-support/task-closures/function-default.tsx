import { TaskContext, type Component } from '@exactjs/core';
class Resource {
	constructor() {
		trace.push('acquire');
	}
	[Symbol.dispose]() {
		trace.push('dispose');
	}
}
export const trace: unknown[] = [];
export const cleaned: unknown[] = [];
export const hooks: { rhs?: () => void } = {};
export function Page(
	this: Component<{
		left: { value: string; sibling: string };
		n: number;
		item: { value: number };
		mode: string;
	}>
) {
	this.state.left = { value: 'before', sibling: 'keep' };
	this.state.n = 1;
	this.state.item = { value: 0 };
	this.state.mode = 'equal';
	async function run(task: TaskContext = TaskContext.server().blocking()) {
		task.cleanup(() => {
			cleaned.push(this.state.left.value, this.state.n);
		});
		const owner = this;
		function apply(
			this: { tag: number },
			v: number = (trace.push('default'), (owner.state.n += 1))
		) {
			const resource = new Resource();
			trace.push('fn', this.tag, arguments.length, v);
			owner.state.n += v;
			resource[Symbol.dispose]();
			return { tag: this.tag, v, n: owner.state.n, args: arguments.length };
		}
		const one = apply.call({ tag: 7 });
		const two = apply.call({ tag: 9 }, 2);
		return { one, two, name: apply.name, length: apply.length };
	}
	return () => <button onClick={() => run()}>run</button>;
}
