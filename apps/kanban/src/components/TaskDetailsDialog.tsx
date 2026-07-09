import type { Component } from "@exact/core";
import { columns } from "../data.js";
import { debugLog } from "../debug.js";
import type { Status, Task, TaskActions } from "../types.js";

type TaskDetailsState = {
  taskId?: string;
  title: string;
  notes: string;
};

type TaskDetailsDialogProps = {
  task?: Task;
  actions: TaskActions;
  close(): void;
};

export function TaskDetailsDialog(this: Component<TaskDetailsState>, props: TaskDetailsDialogProps) {
  this.state.taskId = props.task?.id;
  this.state.title = props.task?.title ?? "";
  this.state.notes = props.task?.notes ?? "";
  this.onMount(() => debugLog("details mount", { taskId: props.task?.id }));
  this.onUnmount(() => debugLog("details unmount", { taskId: props.task?.id }));

  return () => {
    const task = props.task;
    if (!task) return null;

    if (this.state.taskId !== task.id) {
      this.state.taskId = task.id;
      this.state.title = task.title;
      this.state.notes = task.notes;
    }

    return <div className="dialog-backdrop" onClick={props.close}>
      <section
        className="task-dialog"
        onClick={event => {
          event.stopPropagation();
        }}
      >
        <header>
          <h2>Edit card</h2>
          <button type="button" className="quiet-button" onClick={props.close}>
            Close
          </button>
        </header>

        <label>
          <span>Title</span>
          <input
            value={this.state.title}
            onInput={event => {
              this.state.title = (event.target as HTMLInputElement).value;
              debugLog("title input", {
                taskId: task.id,
                value: this.state.title,
                active: activeElementName()
              });
              props.actions.updateTask(task.id, {
                title: this.state.title
              });
            }}
          />
        </label>

        <label>
          <span>Status</span>
          <select
            value={task.status}
            onChange={event => {
              props.actions.updateTask(task.id, {
                status: (event.target as HTMLSelectElement).value as Status
              });
            }}
          >
            {columns.map(column => (
              <option value={column.id}>{column.title}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Notes</span>
          <textarea
            value={this.state.notes}
            rows={8}
            onInput={event => {
              this.state.notes = (event.target as HTMLTextAreaElement).value;
              debugLog("notes input", {
                taskId: task.id,
                length: this.state.notes.length,
                active: activeElementName()
              });
              props.actions.updateTask(task.id, {
                notes: this.state.notes
              });
            }}
          />
        </label>
      </section>
    </div>;
  };
}

function activeElementName(): string {
  const active = document.activeElement;
  return active ? active.tagName.toLowerCase() : "none";
}
