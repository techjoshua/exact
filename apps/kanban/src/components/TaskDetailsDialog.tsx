import type { Component } from "@exact/core";
import { columns } from "../data.js";
import type { Status, Task, TaskActions } from "../types.js";

type TaskDetailsDialogProps = {
  task: Task;
  actions: TaskActions;
  close(): void;
};

export function TaskDetailsDialog(this: Component<{}>, props: TaskDetailsDialogProps) {
  return () => (
    <div className="dialog-backdrop" onClick={props.close}>
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
            value={props.task.title}
            onInput={event => {
              props.actions.updateTask(props.task.id, {
                title: (event.target as HTMLInputElement).value
              });
            }}
          />
        </label>

        <label>
          <span>Status</span>
          <select
            value={props.task.status}
            onChange={event => {
              props.actions.updateTask(props.task.id, {
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
            value={props.task.notes}
            rows={8}
            onInput={event => {
              props.actions.updateTask(props.task.id, {
                notes: (event.target as HTMLTextAreaElement).value
              });
            }}
          />
        </label>
      </section>
    </div>
  );
}
