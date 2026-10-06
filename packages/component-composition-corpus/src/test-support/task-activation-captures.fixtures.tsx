import { createContext, TaskContext, type Component } from '@exactjs/core';

/** Shared input resolved from the component owner on each server dispatch. */
export const CaptureShared = createContext<number>('capture-shared', { keep: 'shared' });
/** Server resource resolved by the trusted request scope, never captured from the browser. */
export const CapturePrivate = createContext<number>('capture-private', {
	keep: 'server',
	scope: 'request'
});
/** Shared publication from the task is observable by a descendant. */
export const CaptureStatus = createContext<{ value: number }>('capture-status', { keep: 'shared' });

/** Displays context publication independently of the task's state result. */
export function CaptureStatusView(this: Component<{}>) {
	const status = this.getContext(CaptureStatus);
	return () => <output data-status>{status.value}</output>;
}

/** Exercises captured defaults alongside local helpers and context execution. */
export function ActivationCaptureInputs(
	this: Component<{ revision: number; draft: number; result: number }>,
	props: { input: number }
) {
	this.state.revision = 1;
	this.state.draft = 2;
	this.state.result = 0;
	this.setContext(CaptureStatus, { value: 0 });
	const shared = this.getContext(CaptureShared);
	const read = () => this.state.revision;
	const run = (
		value: number = props.input + this.state.draft,
		next: number = value + 1,
		task: TaskContext = TaskContext.server().blocking()
	) => {
		void task;
		const privateValue = this.getContext(CapturePrivate);
		const result = value + next + read() + shared + privateValue;
		this.setContext(CaptureStatus, { value: result });
		this.state.result = result;
	};
	void run();
	return () => (
		<section>
			<button data-capture-only onClick={() => this.state.draft++}>
				Change default
			</button>
			<button data-next onClick={() => this.state.revision++}>
				Next
			</button>
			<button data-run onClick={() => run()}>
				Run
			</button>
			<output data-result>{this.state.result}</output>
			<CaptureStatusView />
		</section>
	);
}

/** Supplies shared and server contexts while retaining and removing a child owner. */
export function ActivationCaptureShell(this: Component<{ input: number; shown: boolean }>) {
	this.state.input = 3;
	this.state.shown = true;
	this.setContext(CaptureShared, 5);
	return () => (
		<main>
			<button data-props onClick={() => this.state.input++}>
				Change props
			</button>
			<button data-remove onClick={() => (this.state.shown = false)}>
				Remove
			</button>
			{this.state.shown && <ActivationCaptureInputs input={this.state.input} />}
		</main>
	);
}
