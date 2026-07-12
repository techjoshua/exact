import type { Component } from "@exact/core";
import { BoardContext } from "../context.js";
import type { Column, DragPlacement, Task } from "../types.js";
import { TaskCard } from "./TaskCard.jsx";

type ColumnViewProps = {
  column: Column;
  tasks: Task[];
  dragPlacement?: DragPlacement;
};

/** Renders one kanban status column and its task cards. */
export function ColumnView(this: Component<{}>, props: ColumnViewProps) {
  const board = this.getContext(BoardContext);
  const countLabel = props.tasks.length === 1 ? "1 task" : `${props.tasks.length} tasks`;

  const dropTask = (event: DragEvent) => {
    event.preventDefault();
    const taskId = event.dataTransfer?.getData("text/plain");
    this.log.debug("drop", {
      column: props.column.id,
      taskId,
      hasDataTransfer: Boolean(event.dataTransfer)
    });
    if (taskId) board.commitTaskDrop(taskId, props.column.id);
  };

  const allowDrop = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    this.log.trace("dragover", {
      column: props.column.id,
      hasDataTransfer: Boolean(event.dataTransfer)
    });
  };

  return () => (
    <article
      id={`column-${props.column.id}`}
      className={["column", { empty: props.tasks.length === 0 }]}
      onDragEnter={event => allowDrop(event as DragEvent)}
      onDragOver={event => allowDrop(event as DragEvent)}
      onDrop={event => dropTask(event as DragEvent)}
    >
      <header>
        <h2>{props.column.title}</h2>
        <span>{countLabel}</span>
      </header>

      <div className="cards">
        {props.tasks.length === 0 ? (
          props.dragPlacement?.status === props.column.id ? (
            <DropMarker />
          ) : (
          <p className="empty-state">Drop a card here</p>
          )
        ) : (
          <>
            {this.map(
              props.tasks,
              task => task.id,
              task => (
                <>
                  {props.dragPlacement?.status === props.column.id && props.dragPlacement.beforeTaskId === task.id ? (
                    <DropMarker />
                  ) : null}
                  <TaskCard
                    task={task}
                  />
                </>
              )
            )}
            {props.dragPlacement?.status === props.column.id && props.dragPlacement.beforeTaskId === undefined ? (
              <DropMarker />
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

function DropMarker() {
  return () => <div className="drop-marker" />;
}
