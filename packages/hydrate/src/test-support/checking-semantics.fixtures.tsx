import { TaskContext, type Component } from '@exactjs/core';

function list(items: { id: string }[]) {
	return (
		<ul>
			{items.map((item) => (
				<li key={item.id}>{item.id}</li>
			))}
		</ul>
	);
}

const pending = new Map<string, (value: string) => void>();
function fetchPreview(id: string): Promise<string> {
	return new Promise((resolve) => pending.set(id, resolve));
}

/** Completes a controlled asynchronous result to exercise stale-task fencing. */
export function completePreview(id: string, value: string): void {
	const resolve = pending.get(id);
	if (!resolve) throw new Error('No pending preview: ' + id);
	pending.delete(id);
	resolve(value);
}

/** Combines ordinary helper list identity with a nested awaited object assignment. */
export function CheckingSemantics(
	this: Component<{ items: { id: string }[]; report: { result: { preview: string } } }>
) {
	this.state.items = [{ id: 'a' }, { id: 'b' }];
	this.state.report = { result: { preview: 'initial' } };
	const load = async (id: string, _task: TaskContext = TaskContext.client().latest()) => {
		void _task;
		this.state.report.result = { preview: await fetchPreview(id) };
	};
	return () => (
		<main>
			<button
				id="reorder"
				onClick={() => (this.state.items = [{ id: 'b' }, { id: 'c' }, { id: 'a' }])}
			>
				reorder
			</button>
			<button id="remove" onClick={() => (this.state.items = [{ id: 'b' }, { id: 'c' }])}>
				remove
			</button>
			<button id="first" onClick={() => void load('first')}>
				first
			</button>
			<button id="second" onClick={() => void load('second')}>
				second
			</button>
			{list(this.state.items)}
			<output>{this.state.report.result.preview}</output>
		</main>
	);
}

/** Shared server and browser entry. */
export const checkingRoot = <CheckingSemantics />;
