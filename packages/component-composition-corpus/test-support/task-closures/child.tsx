import { TaskContext, type Component } from '@exactjs/core';
export const trace: unknown[] = [];
export const gates = new Map<string, () => void>();
export const cleaned: string[] = [];
export function Page(this: Component<{ n: number }>) {
	this.state.n = 0;
	async function run(task: TaskContext = TaskContext.server().blocking()) {
		const owner = this;
		const parentSignal = task.signal;
		task.cleanup(() => {
			cleaned.push('parent');
		});
		async function child(childTask: TaskContext = TaskContext.server().detached().blocking()) {
			trace.push('same', childTask.signal === parentSignal);
			childTask.cleanup(() => {
				cleaned.push('child');
			});
			await new Promise<void>((resolve) => gates.set('child', resolve));
			owner.state.n += 1;
			trace.push('child-put', owner.state.n);
			return owner.state.n;
		}
		const launch = async () => await child();
		return await launch();
	}
	return () => <button onClick={() => run()}>run</button>;
}
