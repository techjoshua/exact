import { TaskContext, type Component } from '@exactjs/core';

export const trace: string[] = [];
export const cleaned: string[] = [];
export const gates = new Map<string, () => void>();

export function Page(this: Component<{ mode: string; value: number }>) {
	this.state.mode = 'normal';
	this.state.value = 0;
	const run = async (task: TaskContext = TaskContext.server().parallel().blocking()) => {
		const mode = this.state.mode;
		task.cleanup(() => {
			cleaned.push(mode);
		});
		function original(this: { tag: string }, first: number, second: number) {
			trace.push(mode + ':call:' + this.tag);
			return first + second;
		}
		let selected = original;
		const receiver = {
			tag: 'original',
			get work() {
				trace.push(mode + ':get');
				return selected;
			},
			set work(next: typeof original) {
				trace.push(mode + ':set');
				selected = next;
			}
		};
		async function argument(index: number) {
			trace.push(mode + ':arg' + index);
			if (index === 1) {
				receiver.work = function replacement() {
					trace.push(mode + ':replacement');
					return 99;
				};
				await new Promise<void>((resolve) => gates.set(mode, resolve));
				trace.push(mode + ':resume');
				if (mode === 'throw') throw new Error('argument failure');
			}
			return index;
		}
		try {
			const value = receiver.work(await argument(1), await argument(2));
			this.state.value = value;
			return value;
		} catch (error) {
			trace.push(mode + ':catch:' + (error as Error).name);
			throw error;
		} finally {
			trace.push(mode + ':finally');
		}
	};
	return () => <button onClick={() => run()}>run</button>;
}
