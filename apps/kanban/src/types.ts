export type Status = "todo" | "doing" | "done";

export type Task = {
  id: string;
  title: string;
  status: Status;
  notes: string;
};

export type Column = {
  id: Status;
  title: string;
};

export type BoardState = {
  tasks: Task[];
  draft: string;
  selectedTaskId?: string;
  dragPlacement?: DragPlacement;
};

export type DragPlacement = {
  taskId: string;
  status: Status;
  beforeTaskId?: string;
};

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
  updateTask(taskId: string, patch: Partial<Pick<Task, "title" | "notes" | "status">>): void;
};
