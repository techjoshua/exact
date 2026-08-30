import { TaskContext, type Component } from '@exactjs/core';

type TaskState = { status: string };
let mountedTaskOwner: Component<TaskState> | undefined;

function TaskComposition(this: Component<TaskState>) {
	mountedTaskOwner = this;
	this.state.status = 'idle';
	const load = async (_task: TaskContext = TaskContext.client().blocking()) => {
		void _task;
		await Promise.resolve();
		this.state.status = 'ready';
	};
	return () => (
		<section data-scenario="task">
			<button onClick={() => void load()}>load</button>
			<output>{this.state.status}</output>
		</section>
	);
}

function ServerTaskComposition(this: Component<TaskState>) {
	this.state.status = 'loading';
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
