import { TaskContext, type Component } from '@exactjs/core';

/** Callers own result assignments, even when they invoke the same server task. */
export function ResultOwner(this: Component<{ left: string; right: string }>) {
	this.state.left = 'pending';
	this.state.right = 'pending';
	function read(value: string, task: TaskContext = TaskContext.server()) {
		void task;
		return value;
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
		</section>
	);
}
