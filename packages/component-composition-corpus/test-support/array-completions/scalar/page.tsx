import { TaskContext, type Component } from '@exactjs/core';
import { gate } from './helper.js';
export { gates } from './helper.js';
type Row = { label: string; optional?: string };
export function Page(this: Component<{ rows: Row[] }>) {
	this.state.rows = [{ label: 'A' }, { label: 'B' }];
	const state = this.state;
	async function run(mode: string, task: TaskContext = TaskContext.server().parallel()) {
		void task;
		if (mode === 'same') state.rows[0] = state.rows[0]!;
		if (mode === 'delete') delete state.rows[3];
		if (mode === 'member-delete') delete state.rows[0]!.optional;
		if (mode === 'named-set') state.rows[4294967295] = { label: 'N' };
		if (mode === 'named-delete') delete state.rows[4294967295];
		await gate(mode);
		state.rows.push();
		return state.rows.length;
	}
	return () => (
		<main>
			<button data-mode="same" onClick={() => void run('same')}>
				Same slot
			</button>
			<button data-mode="delete" onClick={() => void run('delete')}>
				Absent delete
			</button>
			<button data-mode="member-delete" onClick={() => void run('member-delete')}>
				Absent member
			</button>
			<button data-mode="named-set" onClick={() => void run('named-set')}>
				Named set
			</button>
			<button data-mode="named-delete" onClick={() => void run('named-delete')}>
				Named delete
			</button>
			<output>{this.state.rows.length}</output>
		</main>
	);
}
