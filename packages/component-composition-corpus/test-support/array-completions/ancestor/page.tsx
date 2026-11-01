import { TaskContext, type Component } from '@exactjs/core';
import { change } from './helper.js';
export function Page(this: Component<{ group: { rows: number[] } }>) {
	this.state.group = { rows: [0] };
	async function run(
		mode: string,
		helper: boolean,
		task: TaskContext = TaskContext.server().parallel()
	) {
		void task;
		if (helper) return change(this.state, mode);
		if (mode === 'replace') this.state.group = { rows: [] };
		if (mode === 'equal') this.state.group = this.state.group;
		this.state.group.rows.push(1);
		return this.state.group.rows.length;
	}
	return () => (
		<main>
			<button data-mode="direct-none" onClick={() => void run('none', false)}>
				Direct mutation
			</button>
			<button data-mode="direct-equal" onClick={() => void run('equal', false)}>
				Direct equal ancestor
			</button>
			<button data-mode="direct-replace" onClick={() => void run('replace', false)}>
				Direct ancestor replacement
			</button>
			<button data-mode="helper-none" onClick={() => void run('none', true)}>
				Helper mutation
			</button>
			<button data-mode="helper-equal" onClick={() => void run('equal', true)}>
				Helper equal ancestor
			</button>
			<button data-mode="helper-replace" onClick={() => void run('replace', true)}>
				Helper ancestor replacement
			</button>
			<output>{this.state.group.rows.length}</output>
		</main>
	);
}
