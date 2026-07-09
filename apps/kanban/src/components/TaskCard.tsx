import type { Component } from "@exact/core";
import { debugLog } from "../debug.js";
import type { Task, TaskActions } from "../types.js";

type TaskCardProps = {
  task: Task;
  actions: TaskActions;
};

export function TaskCard(this: Component<{}>, props: TaskCardProps) {
  const title = this.reactive<string>(() => props.task.title);
  const hasNotes = this.reactive<boolean>(() => props.task.notes.trim().length > 0);

  const startPointerDrag = (event: PointerEvent) => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;

    const card = (event.target as HTMLElement | null)?.closest(".card") as HTMLElement | null;
    if (!card) return;

    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;

    const move = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      if (!dragging && Math.hypot(deltaX, deltaY) > 4) {
        dragging = true;
        card.classList.add("dragging");
        debugLog("pointer dragstart", { taskId: props.task.id });
      }

      if (dragging) {
        card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      }
    };

    const end = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      card.classList.remove("dragging");
      card.style.transform = "";

      const column = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest(".column");
      const status = column?.id.replace("column-", "");
      debugLog("pointer dragend", {
        taskId: props.task.id,
        dragging,
        status
      });

      if (dragging && (status === "todo" || status === "doing" || status === "done")) {
        props.actions.moveTaskById(props.task.id, status);
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };

  return () => (
    <div
      className="card"
      onMouseDown={event => {
        debugLog("card mousedown", {
          taskId: props.task.id,
          target: targetName(event.target)
        });
      }}
      onPointerDown={event => startPointerDrag(event as PointerEvent)}
    >
      <span
        className="drag-handle"
        onClick={event => {
          event.stopPropagation();
        }}
      >
        Drag
      </span>
      <p className="card-title">
        {title}
      </p>
      {hasNotes.get() ? <p className="card-notes">Has notes</p> : null}
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

function targetName(target: EventTarget | null): string {
  if (target instanceof Element) return target.tagName.toLowerCase();
  if (target instanceof Node) return `node:${target.nodeName}`;
  return "unknown";
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, input, select, textarea"));
}
