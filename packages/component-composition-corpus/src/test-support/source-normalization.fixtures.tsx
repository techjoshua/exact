import { peek, TaskContext, type Component } from '@exactjs/core';

/** Exercises inferred setup work through retained input changes. */
export function NormalizationProbe(this: Component<{ input: number; output: number }>) {
	this.state.input = 1;
	this.state.output = this.state.input + 1;
	const offset = this.state.input;
	return () => (
		<section>
			<output id="normalization-result">
				{this.state.output} /{' '}
				{[2].map((input) => {
					const value = input + offset;
					return value;
				})}
			</output>
			<button id="normalization-next" onClick={() => this.state.input++}>
				Next normalization
			</button>
		</section>
	);
}

const __exactTaskContext = 0;

/** Awaited setup retains authored bindings even when their names resemble generated declarations. */
export async function AsyncNormalizationProbe(this: Component<{ value: number }>) {
	const __exactComponentTaskContext = 99;
	const value = await Promise.resolve(__exactComponentTaskContext + __exactTaskContext);
	this.state.value = value;
	return () => (
		<output id="normalization-async-result" onClick={() => this.state.value++}>
			{this.state.value}:{[2].map((value) => value)}
		</output>
	);
}

/** Callback bodies preserve scalar subscriptions and their own parameter scope. */
export function NormalizationCallbackProbe(this: Component<{ value: number }>) {
	this.state.value = 1;
	const offset = this.state.value;
	return () => (
		<section>
			<output>{[2].map((input) => input + offset)}</output>
			<output>
				{[2].map(function (input) {
					const value = input + offset;
					return value;
				})}
			</output>
			<output>
				{[2].map((input) => {
					const value = input + offset;
					if (input > 0) return value;
					return null;
				})}
			</output>
			<output>
				{[2].map((input) => {
					const value = input + this.state.value;
					return value?.toFixed(0);
				})}
			</output>
			<button onClick={() => this.state.value++}>Next callback</button>
		</section>
	);
}

/** Snapshot feedback runs only when the independent live input changes. */
export function NormalizationSnapshotProbe(this: Component<{ input: number; output: number }>) {
	this.state.input = 1;
	this.state.output = 0;
	this.state.output = peek(() => this.state.output) + this.state.input;
	return () => (
		<section>
			<output id="normalization-snapshot-result">{this.state.output}</output>
			<button id="normalization-snapshot-next" onClick={() => this.state.input++}>
				Next snapshot
			</button>
		</section>
	);
}

/** A helper's hidden snapshot is fresh when its task's independent input changes. */
export function NormalizationHelperSnapshotProbe(
	this: Component<{ input: number; snapshot: number; output: number }>
) {
	this.state.input = 1;
	this.state.snapshot = 1;
	this.state.output = 0;
	const value = this.state.snapshot;
	const snapshot = () => value;
	function read() {
		return peek(snapshot);
	}
	this.state.output = read() + this.state.input;
	return () => (
		<section>
			<output id="normalization-helper-result">{this.state.output}</output>
			<button id="normalization-helper-next" onClick={() => this.state.input++}>
				Next helper
			</button>
			<button id="normalization-helper-snapshot" onClick={() => this.state.snapshot++}>
				Change snapshot
			</button>
		</section>
	);
}

/** Explicit task policy keeps body reads separate from setup activation arguments. */
export function NormalizationExplicitTaskProbe(this: Component<{ input: number; output: number }>) {
	this.state.input = 1;
	this.state.output = 0;
	const run = (task: TaskContext = TaskContext.client()) => {
		this.state.output = task.peek(() => this.state.output) + this.state.input;
	};
	run();
	return () => (
		<section>
			<output id="normalization-explicit-result">{this.state.output}</output>
			<button id="normalization-explicit-input" onClick={() => this.state.input++}>
				Change input
			</button>
			<button id="normalization-explicit-run" onClick={() => run()}>
				Run task
			</button>
		</section>
	);
}

/** A setup-only policy task runs once even when its body reads changing state. */
export function NormalizationExplicitSetupProbe(
	this: Component<{ input: number; output: number }>
) {
	this.state.input = 1;
	this.state.output = 0;
	const state = this.state;
	function __exactComponentSetupTask_authored(_task: TaskContext = TaskContext.client()) {
		void _task;
		state.output = state.input + 1;
	}
	__exactComponentSetupTask_authored();
	return () => (
		<section>
			<output id="normalization-startup-result">{this.state.output}</output>
			<button id="normalization-startup-input" onClick={() => this.state.input++}>
				Change setup input
			</button>
		</section>
	);
}

/** Explicit call arguments own activation even when a local helper captures another prop. */
function ExplicitHelperChild(
	this: Component<{ output: number }>,
	props: { input: number; snapshot: number }
) {
	this.state.output = 0;
	const value = props.snapshot + 0;
	const read = () => value;
	const run = (input: number, _task: TaskContext = TaskContext.client()) => {
		void _task;
		this.state.output = read() + input;
	};
	run(props.input);
	return () => <output>{this.state.output}</output>;
}

/** Parent updates distinguish authored inputs from a child's helper-only capture. */
export function NormalizationExplicitHelperProbe(
	this: Component<{ input: number; snapshot: number }>
) {
	this.state.input = 1;
	this.state.snapshot = 1;
	return () => (
		<section>
			<ExplicitHelperChild input={this.state.input} snapshot={this.state.snapshot} />
			<button data-snapshot onClick={() => this.state.snapshot++}>
				Change helper
			</button>
			<button data-input onClick={() => this.state.input++}>
				Change input
			</button>
		</section>
	);
}
