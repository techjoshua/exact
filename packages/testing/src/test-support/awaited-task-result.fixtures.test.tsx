import { TaskContext, type Component } from '@exactjs/core';

/** Callers own result assignments, even when they invoke the same server task. */
export function ResultOwner(this: Component<{ left: string; right: string; trace: string }>) {
	this.state.left = 'pending';
	this.state.right = 'pending';
	this.state.trace = 'pending';
	function read(value: string, task: TaskContext = TaskContext.server()) {
		void task;
		return value;
	}
	async function select(reach: boolean, task: TaskContext = TaskContext.server()) {
		void task;
		let trace = '';
		const known = {
			then(resolve: (value: string) => void) {
				trace += process.version.length > 0 ? 'T' : '!';
				resolve('known');
			}
		};
		const input = {
			get empty() {
				trace += 'L';
				return reach ? null : 'fallback';
			},
			get flag() {
				trace += 'L';
				return reach;
			},
			get receiver() {
				trace += 'R';
				return known;
			}
		};
		const or = await (input.empty || input.receiver);
		const and = await (input.flag && input.receiver);
		const nullish = await (input.empty ?? input.receiver);
		const saved = input.flag ? input.receiver : 'fallback';
		const selected = await saved;
		return [trace, or, and, nullish, selected].join('|');
	}
	return () => (
		<section>
			<button
				data-left
				onClick={async () => {
					this.state.left = await read('first');
				}}
			>
				Left
			</button>
			<button
				data-right
				onClick={async () => {
					this.state.right = await read('second');
				}}
			>
				Right
			</button>
			<output data-left-value>{this.state.left}</output>
			<output data-right-value>{this.state.right}</output>
			<button
				data-reached
				onClick={async () => {
					this.state.trace = await select(true);
				}}
			>
				Reach then
			</button>
			<button
				data-dormant
				onClick={async () => {
					this.state.trace = await select(false);
				}}
			>
				Skip then
			</button>
			<output data-trace>{this.state.trace}</output>
		</section>
	);
}
