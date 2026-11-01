import { TaskContext, type Component } from '@exactjs/core';
import { append, gate, cleaned } from './helper.js';
export { gates, cleaned } from './helper.js';
export function Page(
	this: Component<{ rows: { id: string; label: string; edge?: { street: string } }[] }>
) {
	this.state.rows = [
		{ id: 'a', label: 'A' },
		{ id: 'b', label: 'B' }
	];
	const state = this.state;
	async function run(mode: string, task: TaskContext = TaskContext.server().parallel()) {
		task.cleanup(() => {
			cleaned.push(mode);
		});
		if (mode === 'helper') return append(state, { id: 'c', label: 'C' });
		if (mode === 'direct') {
			state.rows.push({ id: 'c', label: 'C' });
			return state.rows.length;
		}
		if (mode === 'noop') {
			state.rows.push();
			await gate(mode);
			return state.rows.length;
		}
		if (mode === 'reverted') {
			state.rows.push({ id: 'c', label: 'C' });
			state.rows.pop();
			return state.rows.length;
		}
		if (mode === 'move') {
			state.rows.reverse();
			await gate(mode);
			return state.rows.length;
		}
		if (mode === 'member') {
			state.rows[0]!.label = 'server';
			state.rows.push();
			await gate(mode);
			return state.rows.length;
		}
		if (mode === 'same') {
			state.rows[0]!.label = state.rows[0]!.label;
			state.rows.push();
			return state.rows.length;
		}
		if (mode === 'replace') {
			state.rows = [{ id: 'r', label: 'R' }];
			state.rows.push({ id: 'c', label: 'C' });
			return state.rows.length;
		}
		if (mode === 'partial') {
			try {
				state.rows.splice(0, 0, { id: 'p', label: 'P' });
			} catch {}
			return state.rows.length;
		}
		if (mode === 'prewrite') {
			Object.preventExtensions(state.rows);
			try {
				state.rows.push({ id: 'p', label: 'P' });
			} catch {}
			return state.rows.length;
		}
		if (mode === 'override') {
			return state.rows.push({ id: 'o', label: 'O' });
		}
		if (mode === 'uncaught') {
			state.rows.push({ id: 'u', label: 'U' });
			throw new Error('qualification-uncaught');
		}
		return 0;
	}
	return () => (
		<main>
			<button data-mode="helper" onClick={() => void run('helper')}>
				Helper
			</button>
			<button data-mode="direct" onClick={() => void run('direct')}>
				Direct
			</button>
			<button data-mode="noop" onClick={() => void run('noop')}>
				Noop
			</button>
			<button data-mode="reverted" onClick={() => void run('reverted')}>
				Reverted
			</button>
			<button data-mode="move" onClick={() => void run('move')}>
				Move
			</button>
			<button data-mode="member" onClick={() => void run('member')}>
				Member
			</button>
			<button data-mode="same" onClick={() => void run('same')}>
				Same
			</button>
			<button data-mode="replace" onClick={() => void run('replace')}>
				Replace
			</button>
			<button data-mode="partial" onClick={() => void run('partial')}>
				Partial
			</button>
			<button data-mode="prewrite" onClick={() => void run('prewrite')}>
				Prewrite
			</button>
			<button data-mode="override" onClick={() => void run('override')}>
				Override
			</button>
			<button data-mode="uncaught" onClick={() => void run('uncaught')}>
				Uncaught
			</button>
			<output>
				{this.state.rows.length}:{this.state.rows[0]?.label}:{this.state.rows[1]?.label}
			</output>
		</main>
	);
}
