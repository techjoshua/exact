import { TaskContext, type Component } from '@exactjs/core';

/** Preserves the latest optimistic state when an older await enters catch. */
export function ClipboardProbe(this: Component<{ copied: string }>) {
	this.state.copied = '';
	const copy = async (text: string, task: TaskContext = TaskContext.client().latest()) => {
		task.optimistic(() => {
			this.state.copied = text;
		});
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			this.state.copied = '';
		}
	};
	return () => (
		<section data-cancelled-catch>
			<button onClick={() => copy('first')}>First</button>
			<button onClick={() => copy('second')}>Second</button>
			<output>{this.state.copied}</output>
		</section>
	);
}

/** Control without authored rejection recovery. */
export function ClipboardNoCatchProbe(this: Component<{ copied: string }>) {
	this.state.copied = '';
	const copy = async (text: string, task: TaskContext = TaskContext.client().latest()) => {
		task.optimistic(() => {
			this.state.copied = text;
		});
		await navigator.clipboard.writeText(text);
	};
	return () => (
		<section>
			<button onClick={() => copy('first')}>First</button>
			<button onClick={() => copy('second')}>Second</button>
			<output>{this.state.copied}</output>
		</section>
	);
}

/** Exercises cancellation in finalization and non-assignment state writes. */
export function CleanupProbe(
	this: Component<{ count: number; items: string[]; rows: Map<string, string> }>,
	props: { mode: string }
) {
	this.state.count = 0;
	this.state.items = [];
	this.state.rows = new Map();
	// The compiler consumes this policy parameter even when the task body does not read it.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const run = async (text: string, task: TaskContext = TaskContext.client().latest()) => {
		try {
			await navigator.clipboard.writeText(text);
		} finally {
			if (props.mode === 'increment') this.state.count++;
			if (props.mode === 'alias') {
				const state = this.state;
				state.count++;
			}
			if (props.mode === 'return') return (this.state.count += 1);
			if (props.mode === 'expression') {
				const changed = (this.state.count += 1);
				void changed;
			}
			if (props.mode === 'array') this.state.items.push(text);
			if (props.mode === 'map') this.state.rows.set(text, text);
		}
	};
	return () => (
		<section>
			<button onClick={() => run('first')}>First</button>
			<button onClick={() => run('second')}>Second</button>
			<output>
				{this.state.count}:{this.state.items.length}:{this.state.rows.size}
			</output>
		</section>
	);
}

/** Promise callbacks remain owned even when the task contains no await expression. */
export function ClipboardPromiseProbe(this: Component<{ copied: string }>) {
	this.state.copied = '';
	const copy = (text: string, task: TaskContext = TaskContext.client().latest()) => {
		task.optimistic(() => {
			this.state.copied = text;
		});
		return navigator.clipboard.writeText(text).catch(() => {
			this.state.copied = '';
		});
	};
	return () => (
		<section data-cancelled-catch>
			<button onClick={() => copy('first')}>First</button>
			<button onClick={() => copy('second')}>Second</button>
			<output>{this.state.copied}</output>
		</section>
	);
}

/** Retains a mounted array and its observer through optimistic full-clear cancellation. */
export function ArrayRollbackProbe(this: Component<{ items: string[] }>) {
	this.state.items = ['A', 'B', 'C'];
	const run = async (remove: boolean, task: TaskContext = TaskContext.client().latest()) => {
		task.optimistic(() => {
			if (remove) this.state.items.splice(0, 3);
			else this.state.items.push('saved');
		});
		await navigator.clipboard.writeText(remove ? 'clear' : 'keep');
	};
	return () => (
		<section data-array-rollback>
			<button onClick={() => run(true)}>Clear array</button>
			<button onClick={() => run(false)}>Keep array</button>
			<output>{this.state.items.join('|')}</output>
		</section>
	);
}

/** Keeps inherited then lookup on its actual receiver, including abrupt getters. */
export function InheritedAwaitProbe(this: Component<{ label: string }>) {
	this.state.label = 'initial';
	class Parent {
		seen = false;
		marker = 'receiver';
		constructor(readonly fail: boolean) {}
		get then(): undefined {
			void document.title;
			this.seen = true;
			if (this.fail) throw new Error('inherited');
			return undefined;
		}
	}
	class Receiver extends Parent {}
	const run = async (fail: boolean, task: TaskContext = TaskContext.client()) => {
		const receiver = new Receiver(fail);
		try {
			await receiver;
			this.state.label = receiver.seen ? receiver.marker : 'missing getter';
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			this.state.label = 'caught:' + error.message;
		}
	};
	return () => (
		<section>
			<button onClick={() => run(false)}>Run inherited</button>
			<button onClick={() => run(true)}>Throw inherited</button>
			<output>{this.state.label}</output>
		</section>
	);
}

/** Resolve assimilates the supplied value; reject and argument throws do not. */
export function NestedAssimilationProbe(this: Component<{ label: string; trace: string }>) {
	this.state.label = 'initial';
	this.state.trace = '';
	const run = async (
		mode: 'resolve' | 'reject' | 'resolve-throw' | 'reject-throw',
		task: TaskContext = TaskContext.client()
	) => {
		this.state.trace = '';
		const append = (step: string) => {
			this.state.trace += step;
		};
		const input = {
			get value() {
				void document.title;
				append('argument|');
				if (mode === 'resolve-throw' || mode === 'reject-throw') throw new Error('argument');
				return {
					get then(): undefined {
						void window.name;
						append('then|');
						return undefined;
					}
				};
			}
		};
		const outer = {
			then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
				if (mode === 'reject' || mode === 'reject-throw') reject(input.value);
				else resolve(input.value);
			}
		};
		try {
			await outer;
			this.state.label = 'resolved';
		} catch (error) {
			this.state.label = error instanceof Error ? 'caught:' + error.message : 'rejected';
		}
	};
	return () => (
		<section>
			<button onClick={() => run('resolve')}>Resolve nested</button>
			<button onClick={() => run('reject')}>Reject nested</button>
			<button onClick={() => run('resolve-throw')}>Throw resolve argument</button>
			<button onClick={() => run('reject-throw')}>Throw reject argument</button>
			<output>{this.state.label}</output>
			<pre>{this.state.trace}</pre>
		</section>
	);
}

/** An async primitive payload still reaches Await as a Promise with constructor Get work. */
export function AsyncPrimitiveAwaitProbe(
	this: Component<{ label: string; constructorRead: boolean }>
) {
	this.state.label = 'initial';
	this.state.constructorRead = false;
	async function make() {
		return 'primitive';
	}
	const run = async (task: TaskContext = TaskContext.client()) => {
		const previous = Object.getOwnPropertyDescriptor(Promise.prototype, 'constructor');
		let reads = 0;
		try {
			Object.defineProperty(Promise.prototype, 'constructor', {
				configurable: true,
				get() {
					reads++;
					void document.title;
					return Promise;
				}
			});
			this.state.label = await make();
		} finally {
			if (previous) Object.defineProperty(Promise.prototype, 'constructor', previous);
			else Reflect.deleteProperty(Promise.prototype, 'constructor');
			this.state.constructorRead = reads > 0;
		}
	};
	return () => (
		<section>
			<button onClick={() => run()}>Await primitive</button>
			<output>{this.state.label}</output>
			<data>{String(this.state.constructorRead)}</data>
		</section>
	);
}
