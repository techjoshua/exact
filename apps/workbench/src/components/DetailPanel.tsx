import { createRef, type Component } from "@exact/core";
import { WorkbenchContext } from "../context.js";
import { priorities, statuses } from "../data.js";
import type { Priority, Status, Task } from "../types.js";

type DetailPanelProps = {
  task: Task;
  draftLabel: string;
};

/** Renders the editable task detail panel for the selected workbench task. */
export function DetailPanel(this: Component<{}>, props: DetailPanelProps) {
  const workbench = this.getContext(WorkbenchContext);
  const titleRef = createRef<HTMLInputElement>("detail-title");

  this.onMount(() => {
    this.refs.get(titleRef)?.focus();
  });

  return () => (
    <section className="detail-panel">
      <header>
        <h2>Task Detail</h2>
        <button type="button" className="quiet-button" onClick={() => workbench.closeTask()}>
          Close
        </button>
      </header>

      <label>
        <span>Title</span>
        <input
          ref={this.ref(titleRef)}
          value={props.task.title}
          onInput={event => workbench.updateTask(props.task.id, { title: (event.currentTarget as HTMLInputElement).value })}
        />
      </label>

      <label>
        <span>Notes</span>
        <textarea
          rows={6}
          value={props.task.notes}
          onInput={event => workbench.updateTask(props.task.id, { notes: (event.currentTarget as HTMLTextAreaElement).value })}
        />
      </label>

      <label>
        <span>Owner</span>
        <input
          value={props.task.owner}
          onInput={event => workbench.updateTask(props.task.id, { owner: (event.currentTarget as HTMLInputElement).value })}
        />
      </label>

      <div className="field-grid">
        <label>
          <span>Status</span>
          <select
            value={props.task.status}
            onChange={event => workbench.updateTask(props.task.id, { status: (event.currentTarget as HTMLSelectElement).value as Status })}
          >
            {this.map(
              statuses,
              status => status,
              status => <option value={status}>{status}</option>
            )}
          </select>
        </label>

        <label>
          <span>Priority</span>
          <select
            value={props.task.priority}
            onChange={event => workbench.updateTask(props.task.id, { priority: (event.currentTarget as HTMLSelectElement).value as Priority })}
          >
            {this.map(
              priorities,
              priority => priority,
              priority => <option value={priority}>{priority}</option>
            )}
          </select>
        </label>
      </div>

      <form className="label-editor" onSubmit={event => {
        event.preventDefault();
        workbench.addLabel(props.task.id);
      }}>
        <label>
          <span>Labels</span>
          <input
            value={props.draftLabel}
            placeholder="Add label"
            onInput={event => workbench.setDraftLabel((event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button type="submit">Add</button>
      </form>

      <div className="label-row editable">
        {props.task.labels.length
          ? this.map(
            props.task.labels,
            label => label,
            label => (
              <button type="button" onClick={() => workbench.removeLabel(props.task.id, label)}>
                {label} x
              </button>
            )
          )
          : <span>No labels</span>}
      </div>
    </section>
  );
}

/** Renders the empty task detail panel state when no task is selected. */
export function EmptyDetailPanel(this: Component<{}>) {
  return () => (
    <section className="detail-panel empty-detail">
      <h2>Task Detail</h2>
      <p>Select a task to edit title, owner, notes, status, priority, and labels.</p>
    </section>
  );
}
