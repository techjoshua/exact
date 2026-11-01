import { TaskContext, type Component } from '@exactjs/core';
export const trace: unknown[] = [];
export const cleaned: unknown[] = [];
export const hooks: { rhs?: () => void } = {};
function replacement(value = 99) {
	trace.push('replacement', value);
	return value;
}
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
		const old = this.state.item;
		let depth = 0;
		const calls = {
			tag: 7,
			[(trace.push('name'), 'run' as const)](
				v: number = (trace.push('default'),
				(owner.state.item.value =
					++depth === 1 ? ((owner.state.item = { value: 10 }), original.call({ tag: 9 }), 1) : 2))
			) {
				trace.push('body', this.tag, v, owner.state.item.value);
				return v;
			}
		};
		const original = calls.run;
		const selected = calls.run((trace.push('arg'), (calls.run = replacement), 3));
		const omitted = original.call({ tag: 11 });
		const supplied = original.call({ tag: 13 }, 4);
		const changed = calls.run();
		const outcome = {
			selected,
			omitted,
			supplied,
			changed,
			old: old.value,
			current: owner.state.item.value,
			name: original.name,
			length: original.length,
			same: original !== calls.run
		};
		trace.push(outcome);
		return outcome;
	}
	return () => <button onClick={() => run()}>run</button>;
}
