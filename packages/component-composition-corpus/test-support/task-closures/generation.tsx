import { TaskContext, type Component } from '@exactjs/core';
export const gates = new Map<string, () => void>();
export const saved: { method?: () => number; arrow?: () => number } = {};
export const trace: unknown[] = [];
export const cleaned: string[] = [];
export function Page(this: Component<{ request: string; n: number }>) {
	this.state.request = '';
	this.state.n = 0;
	async function run(task: TaskContext = TaskContext.server().parallel()) {
		const label = this.state.request;
		const owner = this;
		task.cleanup(() => {
			cleaned.push(label + ':' + owner.state.n);
		});
		const calls = {
			run() {
				owner.state.n += 1;
				task.cleanup(() => {
					cleaned.push(label + ':method');
				});
				trace.push(label, 'method', owner.state.n);
				return owner.state.n;
			}
		};
		const arrow = () => {
			owner.state.n += 1;
			trace.push(label, 'arrow', owner.state.n);
			return owner.state.n;
		};
		if (label === 'A') {
			saved.method = calls.run;
			saved.arrow = arrow;
			await new Promise<void>((resolve) => gates.set(label, resolve));
			return owner.state.n;
		}
		for (const kind of ['method', 'arrow'] as const) {
			try {
				trace.push('saved', kind, saved[kind]?.());
			} catch (error) {
				trace.push('rejected', kind, (error as Error).name);
			}
		}
		return calls.run();
	}
	return () => <button onClick={() => run()}>run</button>;
}
