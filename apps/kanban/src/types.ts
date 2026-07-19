/** Defines the status type contract. */
export type Status = 'todo' | 'doing' | 'done';

/** Defines the task type contract. */
export type Task = {
	/** @exact key */
	id: string;
	title: string;
	status: Status;
	notes: string;
};

/** Defines the column type contract. */
export type Column = {
	/** @exact key */
	id: Status;
	title: string;
};

/** Tracks the state owned by board. */
export type BoardState = {
	tasks: Task[];
	draft: string;
	selectedTaskId?: string;
	dragPlacement?: DragPlacement;
};

/** Defines the drag placement type contract. */
export type DragPlacement = {
	taskId: string;
	status: Status;
	beforeTaskId?: string;
};

/** Defines the board services type contract. */
export type BoardServices = {
	setDraft(value: string): void;
	addTask(): void;
	closeTask(): void;
	moveTask(task: Task, status: Status): void;
	moveTaskById(taskId: string, status: Status): void;
	previewTaskDrop(taskId: string, status: Status, beforeTaskId?: string): void;
	commitTaskDrop(taskId: string, status: Status, beforeTaskId?: string): void;
	clearTaskDropPreview(): void;
	removeTask(task: Task): void;
	openTask(task: Task): void;
	updateTask(taskId: string, patch: Partial<Pick<Task, 'title' | 'notes' | 'status'>>): void;
};
