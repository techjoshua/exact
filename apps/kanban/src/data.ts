import type { Column, Status, Task } from "./types.js";

export const storageKey = "exact.sample.kanban";

export const columns: Column[] = [
  { id: "todo", title: "To do" },
  { id: "doing", title: "Doing" },
  { id: "done", title: "Done" }
];

const seedTasks: Task[] = [
  {
    id: "task-1",
    title: "Sketch compiler sample",
    status: "todo",
    notes: "Keep this sample readable enough that someone can learn the API from it."
  },
  {
    id: "task-2",
    title: "Wire localStorage",
    status: "doing",
    notes: "State saves whenever the task list actually changes."
  },
  {
    id: "task-3",
    title: "Keep JSX boring",
    status: "done",
    notes: "The custom compiler should make normal-looking TSX reactive."
  }
];

/** Creates a new todo task for the kanban sample. */
export function createTask(title: string): Task {
  return {
    id: crypto.randomUUID(),
    title,
    status: "todo",
    notes: ""
  };
}

/** Loads saved kanban tasks from localStorage, falling back to seeded sample tasks. */
export function loadTasks(): Task[] {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return seedTasks;

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.flatMap(normalizeTask) : seedTasks;
  } catch {
    return seedTasks;
  }
}

function normalizeTask(value: unknown): Task[] {
  if (!value || typeof value !== "object") return [];
  const task = value as Partial<Task>;
  if (typeof task.id !== "string" || typeof task.title !== "string" || !isStatus(task.status)) return [];

  return [{
    id: task.id,
    title: task.title,
    status: task.status,
    notes: typeof task.notes === "string" ? task.notes : ""
  }];
}

function isStatus(value: unknown): value is Status {
  return value === "todo" || value === "doing" || value === "done";
}
