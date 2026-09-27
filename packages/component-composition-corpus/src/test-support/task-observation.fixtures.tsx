import { TaskContext, taskStatus, Suspense, type Component, type TaskStatus } from '@exactjs/core';
import { waitForTask, recordTaskCleanup } from './task-observations.js';

type SearchState = { query: string; result: string };

function Plain(this: Component<SearchState>) {
	this.state.query = 'initial';
	this.state.result = '';
	const search = async (query: string, task: TaskContext = TaskContext.client()) => {
		task.cleanup(() => recordTaskCleanup(task.signal));
		this.state.result = await waitForTask(query, task.signal);
	};
	void search(this.state.query);

	return () => (
		<section>
			<input value:onInput={this.state.query} />
			<output>{this.state.result}</output>
			<span data-status>{'unobserved'}</span>
		</section>
	);
}

function StatusView(this: Component<SearchState>) {
	this.state.query = 'initial';
	this.state.result = '';
	const search = async (query: string, task: TaskContext = TaskContext.client()) => {
		task.cleanup(() => recordTaskCleanup(task.signal));
		this.state.result = await waitForTask(query, task.signal);
	};
	void search(this.state.query);
	const status = taskStatus(search);
	return () => (
		<section>
			<input value:onInput={this.state.query} />
			<output>{this.state.result}</output>
			<data data-pending-count>{status.pendingCount}</data>
			<span data-status>{status.pending ? 'pending' : 'idle'}</span>
		</section>
	);
}

function DirectStatus(this: Component<SearchState>) {
	this.state.query = 'initial';
	this.state.result = '';
	const search = async (query: string, task: TaskContext = TaskContext.client()) => {
		task.cleanup(() => recordTaskCleanup(task.signal));
		this.state.result = await waitForTask(query, task.signal);
	};
	void search(this.state.query);

	return () => (
		<section>
			<input value:onInput={this.state.query} />
			<output>{this.state.result}</output>
			<data data-pending-count>
				{(search as typeof search & TaskStatus<unknown>)['pendingCount']}
			</data>
			<span data-status>
				{(search as typeof search & TaskStatus<unknown>).pending ? 'pending' : 'idle'}
			</span>
		</section>
	);
}

function EventCallable(this: Component<SearchState>) {
	this.state.query = 'initial';
	this.state.result = '';
	const search = async (query: string, task: TaskContext = TaskContext.client()) => {
		task.cleanup(() => recordTaskCleanup(task.signal));
		this.state.result = await waitForTask(query, task.signal);
	};
	void search(this.state.query);

	return () => (
		<section>
			<input value:onInput={this.state.query} />
			<output>{this.state.result}</output>
			<span data-status>{'unobserved'}</span>
			<button onClick={() => search('manual')}>Run manually</button>
		</section>
	);
}

function BlockingStatus(this: Component<SearchState>) {
	this.state.query = 'initial';
	this.state.result = '';
	const search = async (query: string, task: TaskContext = TaskContext.client().blocking()) => {
		task.cleanup(() => recordTaskCleanup(task.signal));
		this.state.result = await waitForTask(query, task.signal);
	};
	void search(this.state.query);
	const status = taskStatus(search);
	return () => (
		<section>
			<input value:onInput={this.state.query} />
			<output>{this.state.result}</output>
			<data data-pending-count>{status.pendingCount}</data>
			<span data-status>{status.pending ? 'pending' : 'idle'}</span>
		</section>
	);
}

/** Source variants must preserve reactive behavior when status or invocation is exposed. */
export const observationRoots = {
	plain: <Plain />,
	view: <StatusView />,
	direct: <DirectStatus />,
	event: <EventCallable />
};
function BlockingBoundary() {
	return () => (
		<Suspense fallback={<p data-fallback>Waiting</p>}>
			<BlockingStatus />
		</Suspense>
	);
}
function NonblockingBoundary() {
	return () => (
		<Suspense fallback={<p data-fallback>Waiting</p>}>
			<StatusView />
		</Suspense>
	);
}
/** Readiness variants share the same controlled work and visible status contract. */
export const suspenseRoots = {
	blocking: <BlockingBoundary />,
	nonblocking: <NonblockingBoundary />
};
