import { TaskContext, type Component } from '@exactjs/core';

/** Exercises captured key types and work-local selectors through setup and invocation. */
export function CapturedTaskInputs(
	this: Component<{ table: { first: number; second: number }; trace: string }>,
	props: { selection: 'first' | 'second'; rows: readonly number[] }
) {
	this.state.table = { first: 7, second: 11 };
	this.state.trace = '';
	const run = (_task: TaskContext = TaskContext.server().blocking()) => {
		void _task;
		class Local {
			#value = 1;
			#read() {
				return this.#value;
			}
			value = this.#read();
			optional = this.#read?.();
		}
		const local = new Local();
		if (local.value !== 1 || local.optional !== 1) throw new Error('Private receiver lost');
		let calls = 0;
		const pick = () => {
			calls++;
			return props.selection;
		};
		const key = props.selection;
		const selected = this.state.table[key];
		const effect = this.state.table[pick()];
		let total = 0;
		for (const key of ['first', 'second'] as const) total += this.state.table[key];
		this.state.trace = [
			selected,
			effect,
			total,
			calls,
			props.rows.map((value) => value.toFixed()).join(',')
		].join(':');
	};
	void run();
	return () => (
		<section>
			<button data-run onClick={() => run()}>
				Run
			</button>
			<output>{this.state.trace}</output>
		</section>
	);
}

/** Retains the child across prop updates and removes it through its owning range. */
export function CapturedTaskShell(this: Component<{ key: 'first' | 'second'; shown: boolean }>) {
	this.state.key = 'first';
	this.state.shown = true;
	return () => (
		<main>
			<button
				data-switch
				onClick={() => (this.state.key = this.state.key === 'first' ? 'second' : 'first')}
			>
				Switch
			</button>
			<button data-remove onClick={() => (this.state.shown = false)}>
				Remove
			</button>
			{this.state.shown && <CapturedTaskInputs selection={this.state.key} rows={[1, 2]} />}
		</main>
	);
}
