/// <reference lib="esnext.disposable" />
import { TaskContext, type Component } from '@exactjs/core';
export const trace: unknown[] = [];
export const cleaned: unknown[] = [];
export const gates = new Map<string, () => void>();
export const readers = new Map<string, () => number>();
class Resource {
	constructor(private label: string) {
		trace.push(label, 'acquire');
	}
	[Symbol.dispose]() {
		trace.push(this.label, 'dispose');
	}
}
export function Page(this: Component<{ label: string; n: number }>) {
	this.state.label = '';
	this.state.n = 0;
	async function run(task: TaskContext = TaskContext.server().parallel().blocking()) {
		const owner = this;
		const label = owner.state.label;
		readers.set(label, () => owner.state.n);
		task.cleanup(() => {
			cleaned.push(label, owner.state.n);
		});
		const work = async () => {
			const resource = new Resource(label);
			try {
				owner.state.n += 1;
				trace.push(label, 'pre', owner.state.n);
				await new Promise<void>((resolve) => gates.set(label, resolve));
				owner.state.n += 2;
				trace.push(label, 'post', owner.state.n);
				return owner.state.n;
			} finally {
				resource[Symbol.dispose]();
			}
		};
		return await work();
	}
	return () => <button onClick={() => run()}>run</button>;
}
