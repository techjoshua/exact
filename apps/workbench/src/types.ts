export type Status = "backlog" | "active" | "review" | "done";

export type Priority = "low" | "medium" | "high";

export type ViewMode = "board" | "list";

export type SyncState = "idle" | "saving" | "synced" | "failed";

export type Task = {
  /** @exact key */
  id: string;
  title: string;
  notes: string;
  status: Status;
  priority: Priority;
  owner: string;
  labels: string[];
  updatedAt: string;
};

export type Column = {
  /** @exact key */
  id: Status;
  title: string;
};

export type Activity = {
  /** @exact key */
  id: string;
  message: string;
  at: string;
};

export type WorkbenchState = {
  tasks: Task[];
  query: string;
  draftTitle: string;
  draftLabel: string;
  view: ViewMode;
  selectedTaskId?: string;
  activity: Activity[];
  paletteOpen: boolean;
  importOpen: boolean;
  importText: string;
  importError?: string;
  syncState: SyncState;
};

export type WorkbenchServices = {
  setQuery(value: string): void;
  setDraftTitle(value: string): void;
  setDraftLabel(value: string): void;
  setView(value: ViewMode): void;
  createTask(): void;
  selectTask(task: Task): void;
  closeTask(): void;
  moveTask(task: Task, status: Status): void;
  moveSelected(status: Status): void;
  updateTask(taskId: string, patch: Partial<Pick<Task, "title" | "notes" | "priority" | "owner" | "status" | "labels">>): void;
  addLabel(taskId: string): void;
  removeLabel(taskId: string, label: string): void;
  openPalette(): void;
  closePalette(): void;
  openImport(): void;
  closeImport(): void;
  setImportText(value: string): void;
  importTasks(): void;
  exportTasks(): void;
  resetSampleData(): void;
  raiseDemoError(): void;
};
