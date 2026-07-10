import type { Component } from "@exact/core";
import type { Task } from "../types.js";
import { TaskCard } from "./TaskCard.jsx";

type ListViewProps = {
  tasks: Task[];
};

export function ListView(this: Component<{}>, props: ListViewProps) {
  return () => (
    <section className="list-view" aria-label="Task list">
      {props.tasks.length
        ? this.map(
          props.tasks,
          task => task.id,
          task => <TaskCard task={task} compact={true} />
        )
        : <p className="empty-state">No matching tasks.</p>}
    </section>
  );
}
