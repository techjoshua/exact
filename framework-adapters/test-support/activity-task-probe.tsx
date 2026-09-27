import { Activity, TaskContext, type ActivityMode, type Component } from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';

let pending: Promise<string>;
let release: (value: string) => void;
const publications: string[] = [];

function Panel(this: Component<{ value: string }>) {
	this.state.value = 'base';
	const load = async (_task: TaskContext = TaskContext.client().latest()) => {
		void _task;
		this.state.value = await pending;
		publications.push(this.state.value);
	};
	this.onMount(() => load());
	return () => <p>{this.state.value}</p>;
}

function App(this: Component<{ mode: ActivityMode }>) {
	this.state.mode = 'active';
	return () => (
		<section>
			<button
				onClick={() => {
					this.state.mode = this.state.mode === 'active' ? 'parked' : 'active';
				}}
			>
				Toggle
			</button>
			<Activity mode={this.state.mode}>
				<Panel />
			</Activity>
		</section>
	);
}

/** Checks compiled component task ownership against the runtime actually bundled by each adapter. */
export async function probeActivityTask() {
	publications.length = 0;
	pending = new Promise((resolve) => {
		release = resolve;
	});
	const root = document.createElement('div');
	render(<App />, root);
	try {
		await new Promise((resolve) => setTimeout(resolve, 0));
		const element = root.querySelector('p')!;
		const toggle = root.querySelector('button')!;
		toggle.click();
		flushSync();
		release('ready');
		await new Promise((resolve) => setTimeout(resolve, 0));
		const parked = [...publications];
		const detached = !root.querySelector('p');
		toggle.click();
		flushSync();
		for (let i = 0; i < 20 && element.textContent !== 'ready'; i++) {
			await new Promise((resolve) => setTimeout(resolve, 0));
			flushSync();
		}
		return {
			parked,
			detached,
			publications: [...publications],
			text: element.textContent,
			retained: root.querySelector('p') === element
		};
	} finally {
		release('ready');
		unmount(root);
	}
}
