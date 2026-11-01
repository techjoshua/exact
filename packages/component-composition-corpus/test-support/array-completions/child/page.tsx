import { TaskContext, type Component } from '@exactjs/core';
import { append, note, cleaned, waitForPush } from './helper.js';
export { gates, observations, cleaned } from './helper.js';
export function Page(this: Component<{ values: number[]; mode: string }>) {
	this.state.values = [0];
	this.state.mode = 'none';
	async function child(task: TaskContext = TaskContext.server().parallel()) {
		task.cleanup(() => {
			cleaned.push('child');
		});
		return await append(this.state, 11, 'child');
	}
	async function sibling(task: TaskContext = TaskContext.server().parallel()) {
		task.cleanup(() => {
			cleaned.push('sibling');
		});
		return await append(this.state, 22, 'sibling');
	}
	async function save(task: TaskContext = TaskContext.server().parallel()) {
		task.cleanup(() => {
			cleaned.push('parent');
		});
		const alias = this.state.values;
		if (this.state.mode === 'next') {
			return await append(this.state, 33, 'next');
		}
		const invocation = child();
		if (this.state.mode === 'unobserved') {
			void invocation;
			await waitForPush('child');
			note('parent:immediate-alias', alias.length, alias);
			child.cancel('qualification-unobserved');
			return 1;
		}
		const observed = invocation.catch(() => -1);
		await waitForPush('child');
		note('parent:immediate-alias', alias.length, alias);
		if (this.state.mode === 'root') {
			await observed;
			return 2;
		}
		child.cancel('qualification-caught');
		await observed;
		note('parent:child-settled-alias', alias.length, alias);
		if (this.state.mode === 'sibling') await sibling();
		return alias.length;
	}
	return () => <button onClick={() => save()}>Save</button>;
}
