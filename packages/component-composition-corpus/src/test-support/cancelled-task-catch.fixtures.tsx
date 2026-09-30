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
