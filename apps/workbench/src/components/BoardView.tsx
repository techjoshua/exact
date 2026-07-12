import type { Component } from "@exact/core";
import type { Column, Task } from "../types.js";
import { TaskCard } from "./TaskCard.jsx";

type BoardViewProps = {
  columns: Column[];
  tasks: Task[];
};

/** Renders workbench tasks grouped by status columns. */
export function BoardView(this: Component<{}>, props: BoardViewProps) {
  return () => (
    <section className="board-view">
      {this.map(
        props.columns,
        column => column.id,
        column => {
          const tasks = props.tasks.filter(task => task.status === column.id);
          return (
            <section className={["column", !tasks.length && "empty"]}>
              <header>
                <h2>{column.title}</h2>
                <span>{tasks.length}</span>
              </header>
              <div className="task-stack">
                {tasks.length
                  ? this.map(
                    tasks,
                    task => task.id,
                    task => <TaskCard task={task} />
                  )
                  : <p className="empty-state">No tasks</p>}
              </div>
            </section>
          );
        }
      )}
    </section>
  );
}
