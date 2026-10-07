import { peek, TaskContext, type Component } from '@exactjs/core';

/** Server work retains snapshot authority through a named local callback. */
export function NormalizationServerSnapshotProbe(
	this: Component<{ input: number; snapshot: number; output: number }>
) {
	this.state.input = 1;
	this.state.snapshot = 1;
	this.state.output = 0;
	const snapshot = () => this.state.snapshot;
	const read = () => peek(snapshot);
	const run = (input: number, _task: TaskContext = TaskContext.server().blocking()) => {
		void _task;
		this.state.output = read() + input;
	};
	run(this.state.input);
	return () => (
		<section>
			<output id="normalization-server-snapshot-result">{this.state.output}</output>
			<button id="normalization-server-snapshot-change" onClick={() => this.state.snapshot++}>
				Change snapshot
			</button>
			<button id="normalization-server-snapshot-next" onClick={() => this.state.input++}>
				Change input
			</button>
		</section>
	);
}

/** Compiler-inferred async setup retains reactivity despite its generated policy parameter. */
export async function NormalizationAsyncInputProbe(
	this: Component<{ input: number; output: number }>
) {
	this.state.input = 1;
	this.state.output = await Promise.resolve(this.state.input * 2);
	return () => (
		<section>
			<output id="normalization-async-input-result">{this.state.output}</output>
			<button id="normalization-async-input-next" onClick={() => this.state.input++}>
				Change async input
			</button>
		</section>
	);
}
