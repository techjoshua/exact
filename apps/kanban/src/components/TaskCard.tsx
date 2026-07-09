import type { Component } from "@exact/core";
import { columns } from "../data.js";
import type { Status, Task, TaskActions } from "../types.js";

type TaskCardProps = {
  task: Task;
  actions: TaskActions;
};

export function TaskCard(this: Component<{}>, props: TaskCardProps) {
  const hasNotes = this.reactive(props.task.notes.trim().length > 0);

  const startDrag = (event: DragEvent) => {
    event.dataTransfer?.setData("text/plain", props.task.id);
    event.dataTransfer?.setData("application/x-exact-task", props.task.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };

  return () => (
    <div
      className="card"
      draggable={true}
      onDragStart={event => startDrag(event as DragEvent)}
      onDoubleClick={() => props.actions.openTask(props.task)}
    >
      <button className="card-title" type="button" onClick={() => props.actions.openTask(props.task)}>
        {props.task.title}
      </button>
      {hasNotes ? <p className="card-notes">Has notes</p> : null}
      <div className="card-actions">
        <select
          value={props.task.status}
          onChange={event => props.actions.moveTask(props.task, (event.target as HTMLSelectElement).value as Status)}
        >
          {columns.map(column => (
            <option value={column.id}>{column.title}</option>
          ))}
        </select>
        <button type="button" onClick={() => props.actions.removeTask(props.task)}>
          Remove
        </button>
      </div>
    </div>
  );
}
