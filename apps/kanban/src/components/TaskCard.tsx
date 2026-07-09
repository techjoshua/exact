import type { Component } from "@exact/core";
import type { Task, TaskActions } from "../types.js";

type TaskCardProps = {
  task: Task;
  actions: TaskActions;
};

export function TaskCard(this: Component<{}>, props: TaskCardProps) {
  const hasNotes = this.reactive(props.task.notes.trim().length > 0);

  const startDrag = (event: DragEvent) => {
    event.dataTransfer?.setData("text/plain", props.task.id);
    event.dataTransfer?.setData("application/x-exact-task", props.task.id);
    if (!event.dataTransfer) return;

    event.dataTransfer.effectAllowed = "move";
    const card = (event.target as HTMLElement | null)?.closest(".card") as HTMLElement | null;
    if (!card) return;

    const dragImage = card.cloneNode(true) as HTMLElement;
    dragImage.classList.add("card-drag-image");
    dragImage.style.width = `${card.offsetWidth}px`;
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, Math.min(24, card.offsetWidth / 2), 18);
    window.setTimeout(() => dragImage.remove(), 0);
  };

  return () => (
    <div
      className="card"
      draggable={true}
      onDragStart={event => startDrag(event as DragEvent)}
      onClick={() => props.actions.openTask(props.task)}
    >
      <p className="card-title">
        {props.task.title}
      </p>
      {hasNotes ? <p className="card-notes">Has notes</p> : null}
      <div className="card-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={event => {
            event.stopPropagation();
            props.actions.openTask(props.task);
          }}
        >
          Notes
        </button>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            props.actions.removeTask(props.task);
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
