import { TaskContext, type Component } from '@exactjs/core';

type Snapshot = { completed: number; slow: boolean; failReceiver: boolean };

/** Exercises missable progress independently of the server's final result. */
export function ProgressPage(
	this: Component<{
		progress: number;
		result: number;
		runs: number;
		active: boolean;
		error: string;
	}>
) {
	this.state.progress = 0;
	this.state.result = 0;
	this.state.runs = 0;
	this.state.active = false;
	this.state.error = '';
	async function report(snapshot: Snapshot, _task: TaskContext = TaskContext.client().progress()) {
		void _task;
		if (snapshot.failReceiver && snapshot.completed === 1)
			throw new Error('expected progress receiver failure');
		await new Promise<void>((resolve) => {
			setTimeout(resolve, snapshot.slow ? 1000 : 5);
		});
		this.state.progress = snapshot.completed;
	}
	async function job(
		id: number,
		slow: boolean,
		fail: boolean,
		failReceiver: boolean,
		_task: TaskContext = TaskContext.server()
	) {
		void _task;
		for (let completed = 1; completed <= 3; completed++) {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 60);
			});
			report({ completed, slow, failReceiver });
		}
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 100);
		});
		if (fail) throw new Error('expected server failure');
		return id;
	}
	async function start(
		slow: boolean,
		fail: boolean,
		failReceiver: boolean,
		_task: TaskContext = TaskContext.client().latest()
	) {
		void _task;
		this.state.progress = 0;
		this.state.error = '';
		this.state.active = true;
		const id = ++this.state.runs;
		try {
			this.state.result = await job(id, slow, fail, failReceiver);
			this.state.progress = 100;
		} catch {
			this.state.error = 'failed';
		} finally {
			this.state.active = false;
		}
	}
	return () => (
		<section>
			<button id="normal" onClick={() => start(false, false, false)}>
				Start
			</button>
			<button id="slow" onClick={() => start(true, false, false)}>
				Slow receiver
			</button>
			<button id="fail" onClick={() => start(false, true, false)}>
				Server failure
			</button>
			<button id="receiver-fail" onClick={() => start(false, false, true)}>
				Receiver failure
			</button>
			<output id="progress">{this.state.progress}</output>
			<output id="result">{this.state.result}</output>
			<output id="active">{String(this.state.active)}</output>
			<output id="error">{this.state.error}</output>
		</section>
	);
}
