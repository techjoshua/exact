import { TaskContext, type Component } from '@exactjs/core';

type TaskState = { status: string; runs: number };
let mountedTaskOwner: Component<TaskState> | undefined;

function TaskComposition(this: Component<TaskState>) {
	mountedTaskOwner = this;
	this.state.status = 'idle';
	this.state.runs = 0;
	const load = async (_task: TaskContext = TaskContext.client().blocking()) => {
		void _task;
		this.state.runs += 1;
		await Promise.resolve();
		this.state.status = 'ready';
	};
	void load();
	return () => (
		<section data-scenario="task">
			<button onClick={() => void load()}>load</button>
			<output>{this.state.status}</output>
			<data value={this.state.runs}>{this.state.runs}</data>
		</section>
	);
}

function ServerTaskComposition(this: Component<TaskState>) {
	this.state.status = 'loading';
	this.state.runs = 0;
	const settle = async (_task: TaskContext = TaskContext.server().blocking()) => {
		void _task;
		await Promise.resolve();
		this.state.status = 'ready';
	};
	settle();
	return () => <output data-scenario="server-task">{this.state.status}</output>;
}

/** Compiler-issued task root. */
export const taskRoot = <TaskComposition />;

/** Compiler-issued blocking server-task root. */
export const serverTaskRoot = <ServerTaskComposition />;

/** Reads the mounted compiler task owner. */
export function taskOwner(): Component<TaskState> {
	if (!mountedTaskOwner) throw new Error('Task scenario is not mounted');
	return mountedTaskOwner;
}

type IndexedTaskState = { direct: number; derived: number };

function IndexedTaskDependencies(this: Component<IndexedTaskState>, props: { revision: number }) {
	this.state.direct = 0;
	this.state.derived = 0;
	const observeDirect = async (
		revision: number,
		_task: TaskContext = TaskContext.client().blocking()
	) => {
		void _task;
		this.state.direct = revision;
	};
	const observeDerived = async (
		revision: number,
		_task: TaskContext = TaskContext.client().blocking()
	) => {
		void _task;
		this.state.derived = revision;
	};
	void observeDirect(props.revision);
	void observeDerived(props.revision + 1);
	return () => (
		<output data-scenario="indexed-task-dependencies">
			{this.state.direct}:{this.state.derived}
		</output>
	);
}

/** Creates a root covering exact and arbitrary compiler-owned task dependency sources. */
export const indexedTaskDependenciesRoot = (revision: number) => (
	<IndexedTaskDependencies revision={revision} />
);
