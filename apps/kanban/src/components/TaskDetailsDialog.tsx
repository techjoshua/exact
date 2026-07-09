import type { Component } from "@exact/core";
import { columns } from "../data.js";
import { debugLog } from "../debug.js";
import type { Status, Task, TaskActions } from "../types.js";

type TaskDetailsState = {
  taskId?: string;
};

type TaskDetailsDialogProps = {
  task?: Task;
  actions: TaskActions;
  close(): void;
};

export function TaskDetailsDialog(this: Component<TaskDetailsState>, props: TaskDetailsDialogProps) {
  const taskId = props.task?.id ?? "";
  const title = this.reactive(() => props.task?.title ?? "");
  const status = this.reactive(() => props.task?.status ?? "todo");
  const notes = this.reactive(() => props.task?.notes ?? "");

  this.state.taskId = taskId;
  this.onMount(() => debugLog("details mount", { taskId }));
  this.onUnmount(() => debugLog("details unmount", { taskId }));

  return () => {
    return <div className="dialog-backdrop" onClick={props.close}>
      <section
        className="task-dialog"
        onClick={event => {
          event.stopPropagation();
        }}
        onFocusIn={event => {
          debugLog("details focusin", {
            taskId,
            target: eventTargetName(event.target),
            active: activeElementName()
          });
        }}
        onFocusOut={event => {
          debugLog("details focusout", {
            taskId,
            target: eventTargetName(event.target),
            relatedTarget: eventTargetName((event as FocusEvent).relatedTarget),
            active: activeElementName()
          });
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
            defaultValue={title}
            onFocusIn={event => {
              debugLog("title focusin", {
                taskId,
                target: eventTargetName(event.target),
                active: activeElementName()
              });
            }}
            onFocusOut={event => {
              debugLog("title focusout", {
                taskId,
                relatedTarget: eventTargetName((event as FocusEvent).relatedTarget),
                active: activeElementName()
              });
            }}
            onInput={event => {
              const title = (event.target as HTMLInputElement).value;
              debugLog("title input", {
                taskId,
                value: title,
                active: activeElementName()
              });
              props.actions.updateTask(taskId, {
                title
              });
            }}
          />
        </label>

        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={event => {
              props.actions.updateTask(taskId, {
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
            defaultValue={notes}
            rows={8}
            onFocusIn={event => {
              debugLog("notes focusin", {
                taskId,
                target: eventTargetName(event.target),
                active: activeElementName()
              });
            }}
            onFocusOut={event => {
              debugLog("notes focusout", {
                taskId,
                relatedTarget: eventTargetName((event as FocusEvent).relatedTarget),
                active: activeElementName()
              });
            }}
            onInput={event => {
              const notes = (event.target as HTMLTextAreaElement).value;
              debugLog("notes input", {
                taskId,
                length: notes.length,
                active: activeElementName()
              });
              props.actions.updateTask(taskId, {
                notes
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
  return elementName(active);
}

function eventTargetName(target: EventTarget | null): string {
  return target instanceof Element ? elementName(target) : "none";
}

function elementName(element: Element | null): string {
  if (!element) return "none";
  const tag = element.tagName.toLowerCase();
  if (element instanceof HTMLInputElement) return `${tag}[type=${element.type}]`;
  if (element instanceof HTMLButtonElement) return `${tag}[text=${element.textContent?.trim() ?? ""}]`;
  return tag;
}
