import { TaskContext, type Component } from '@exactjs/core';
import { touch } from './helper.js';
export const gates = new Map<string, () => void>();
export const cleaned: string[] = [];
export const completions: string[] = [];
export let retained: Component<{ rows: { id: string; label: string }[] }>;
export function Page(this: typeof retained) {
	retained = this;
	this.state.rows = [
		{ id: 'a', label: 'A' },
		{ id: 'b', label: 'B' }
	];
	async function save(
		key: string,
		value: string,
		task: TaskContext = TaskContext.server().latest().key(key).blocking()
	) {
		task.cleanup(() => {
			cleaned.push(key + value);
		});
		await new Promise<void>((resolve) => gates.set(key + value, resolve));
		if (key === 'a') this.state.rows[0]!.label = value;
		else this.state.rows[1]!.label = value;
		touch(this.state);
		return value;
	}
	return () => (
		<main>
			<button data-a onClick={() => void save('a', 'A1').then((value) => completions.push(value))}>
				A
			</button>
			<button data-b onClick={() => void save('b', 'B2').then((value) => completions.push(value))}>
				B
			</button>
			<button
				data-next
				onClick={() => void save('a', 'A3').then((value) => completions.push(value))}
			>
				Next
			</button>
			<output>
				{this.state.rows[0]!.label}:{this.state.rows[1]!.label}
			</output>
		</main>
	);
}
