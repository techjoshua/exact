import type { Component } from "@exact/core";
import type { Column, Task, TaskActions } from "../types.js";
import { TaskCard } from "./TaskCard.jsx";

type ColumnViewProps = {
  column: Column;
  tasks: Task[];
  actions: TaskActions;
};

export function ColumnView(this: Component<{}>, props: ColumnViewProps) {
  const countLabel = this.reactive(props.tasks.length === 1 ? "1 task" : `${props.tasks.length} tasks`);

  const dropTask = (event: DragEvent) => {
    event.preventDefault();
    const taskId = event.dataTransfer?.getData("text/plain");
    if (taskId) props.actions.moveTaskById(taskId, props.column.id);
  };

  return () => (
    <article
      className={["column", { empty: props.tasks.length === 0 }]}
      onDragOver={event => {
        event.preventDefault();
      }}
      onDrop={event => dropTask(event as DragEvent)}
    >
      <header>
        <h2>{props.column.title}</h2>
        <span>{countLabel}</span>
      </header>

      <div className="cards">
        {props.tasks.length === 0 ? (
          <p className="empty-state">Drop a card here</p>
        ) : (
          this.map(
            props.tasks,
            task => task.id,
            task => (
              <TaskCard
                task={task}
                actions={props.actions}
              />
            )
          )
        )}
      </div>
    </article>
  );
}
