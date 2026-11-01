import { TaskContext, type Component } from '@exactjs/core';
export function Page(this: Component<{ rows: { edge?: { street: string; local: string } }[] }>) {
	this.state.rows = [
		{ edge: { street: 'old', local: 'keep' } },
		{ edge: { street: 'old', local: 'keep' } }
	];
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		void task;
		delete this.state.rows[0]!.edge;
		this.state.rows[1]!.edge!.street = 'new';
		this.state.rows.push();
	}
	return () => (
		<main>
			<button onClick={() => void run()}>Change duplicate</button>
			<output>{this.state.rows.length}</output>
		</main>
	);
}
