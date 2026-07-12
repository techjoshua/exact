import type { Component } from "@exact/core";
import { BoardContext } from "../context.js";
import type { Task } from "../types.js";

type TaskCardProps = {
  task: Task;
};

/** Renders one draggable kanban task card. */
export function TaskCard(this: Component<{}>, props: TaskCardProps) {
  const board = this.getContext(BoardContext);
  const title = props.task.title;
  const hasNotes = this.reactive<boolean>(() => props.task.notes.trim().length > 0);

  const startPointerDrag = (event: PointerEvent) => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;

    const card = (event.target as HTMLElement | null)?.closest(".card") as HTMLElement | null;
    if (!card) return;

    const startX = event.clientX;
    const startY = event.clientY;
    let clone: HTMLElement | undefined;
    let dragging = false;

    const move = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      if (!dragging && Math.hypot(deltaX, deltaY) > 4) {
        dragging = true;
        const rect = card.getBoundingClientRect();
        clone = card.cloneNode(true) as HTMLElement;
        clone.classList.add("dragging");
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        document.body.appendChild(clone);
        card.classList.add("drag-source");
        this.log.debug("pointer dragstart", { taskId: props.task.id });
      }

      if (dragging) {
        if (clone) clone.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      }
    };

    const end = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointermove", preview);
      window.removeEventListener("pointerup", end);
      clone?.remove();
      card.classList.remove("drag-source");

      const placement = findDropPlacement(props.task.id, upEvent.clientX, upEvent.clientY);
      this.log.debug("pointer dragend", {
        taskId: props.task.id,
        dragging,
        status: placement?.status,
        beforeTaskId: placement?.beforeTaskId
      });

      if (dragging && placement) {
        board.commitTaskDrop(props.task.id, placement.status, placement.beforeTaskId);
      } else {
        board.clearTaskDropPreview();
      }
    };

    const preview = (moveEvent: PointerEvent) => {
      if (!dragging) return;
      const placement = findDropPlacement(props.task.id, moveEvent.clientX, moveEvent.clientY);
      if (placement) {
        board.previewTaskDrop(props.task.id, placement.status, placement.beforeTaskId);
      } else {
        board.clearTaskDropPreview();
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointermove", preview);
    window.addEventListener("pointerup", end);
  };

  return () => (
    <div
      className="card"
      data-task-id={props.task.id}
      onMouseDown={event => {
        this.log.debug("card mousedown", {
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
            board.openTask(props.task);
          }}
        >
          Notes
        </button>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            board.removeTask(props.task);
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

type DropPlacement = {
  status: "todo" | "doing" | "done";
  beforeTaskId?: string;
};

function findDropPlacement(draggedTaskId: string, clientX: number, clientY: number): DropPlacement | undefined {
  const column = document.elementFromPoint(clientX, clientY)?.closest(".column") as HTMLElement | null;
  if (!column) return undefined;
  const status = column?.id.replace("column-", "");
  if (status !== "todo" && status !== "doing" && status !== "done") return undefined;

  const cards = Array.from(column.querySelectorAll<HTMLElement>(".card[data-task-id]"))
    .filter(card => card.dataset.taskId !== draggedTaskId);
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      return {
        status,
        beforeTaskId: card.dataset.taskId
      };
    }
  }

  return { status };
}

function targetName(target: EventTarget | null): string {
  if (target instanceof Element) return target.tagName.toLowerCase();
  if (target instanceof Node) return `node:${target.nodeName}`;
  return "unknown";
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, input, select, textarea"));
}
