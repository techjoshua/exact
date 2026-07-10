import type { Column, Priority, Status, Task } from "./types.js";

export const storageKey = "exact-workbench-tasks";

export const columns: Column[] = [
  { id: "backlog", title: "Backlog" },
  { id: "active", title: "Active" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" }
];

export const priorities: Priority[] = ["low", "medium", "high"];

export const statuses: Status[] = columns.map(column => column.id);

export function loadTasks(): Task[] {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved) as Task[];
  } catch {
    // Fall through to seeded data; this sample should remain usable after bad edits.
  }

  return seedTasks();
}

export function seedTasks(): Task[] {
  return [
    createTask("Shape the v0 public API contract", "Define what is stable enough for external examples.", "active", "high", "Mara", ["api", "docs"]),
    createTask("Build command palette actions", "Use refs and context-backed services for keyboard-driven workflows.", "backlog", "medium", "Jo", ["ux"]),
    createTask("Add import and export", "Exercise task lifecycles, serialization, and error reporting.", "review", "medium", "Ren", ["data"]),
    createTask("Document reactive compiler edge cases", "Make strict equality and expression-boundary behavior explicit.", "done", "high", "Ari", ["compiler", "docs"]),
    createTask("Test focus handoff through refs", "Open detail and palette flows without losing editing context.", "active", "medium", "Mara", ["refs"]),
    createTask("Simulate recoverable sync failures", "Show how errors surface without making every component a boundary.", "backlog", "low", "Ari", ["errors"])
  ];
}

export function parseTaskImport(source: string): Task[] {
  const parsed = JSON.parse(source) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Import must be a JSON array of tasks.");

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Task ${index + 1} is not an object.`);
    const candidate = item as Partial<Task>;
    if (typeof candidate.title !== "string" || !candidate.title.trim()) {
      throw new Error(`Task ${index + 1} needs a title.`);
    }
    const status = isStatus(candidate.status) ? candidate.status : "backlog";
    const priority = isPriority(candidate.priority) ? candidate.priority : "medium";
    return {
      id: typeof candidate.id === "string" && candidate.id ? candidate.id : crypto.randomUUID(),
      title: candidate.title,
      notes: typeof candidate.notes === "string" ? candidate.notes : "",
      status,
      priority,
      owner: typeof candidate.owner === "string" && candidate.owner ? candidate.owner : "Unassigned",
      labels: Array.isArray(candidate.labels) ? candidate.labels.filter((label): label is string => typeof label === "string" && !!label.trim()) : [],
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString()
    };
  });
}

function isStatus(value: unknown): value is Status {
  return typeof value === "string" && statuses.includes(value as Status);
}

function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && priorities.includes(value as Priority);
}

export function createTask(
  title: string,
  notes = "",
  status: Status = "backlog",
  priority: Priority = "medium",
  owner = "Unassigned",
  labels: string[] = []
): Task {
  return {
    id: crypto.randomUUID(),
    title,
    notes,
    status,
    priority,
    owner,
    labels,
    updatedAt: new Date().toISOString()
  };
}
