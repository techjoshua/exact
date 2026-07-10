import { createRef, type Component } from "@exact/core";
import { WorkbenchContext } from "../context.js";
import { columns } from "../data.js";
import type { Task } from "../types.js";

type CommandPaletteProps = {
  tasks: Task[];
  selectedTask?: Task;
};

export function CommandPalette(this: Component<{}>, props: CommandPaletteProps) {
  const workbench = this.getContext(WorkbenchContext);
  const firstActionRef = createRef<HTMLButtonElement>("first-command");

  this.onMount(() => {
    this.refs.get(firstActionRef)?.focus();
  });

  const run = (action: () => void) => {
    action();
    workbench.closePalette();
  };

  return () => (
    <div className="dialog-backdrop" onClick={() => workbench.closePalette()}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={event => event.stopPropagation()}>
        <header>
          <div>
            <h2>Actions</h2>
            <p>{props.tasks.length} tasks in the current filter.</p>
          </div>
          <button type="button" className="quiet-button" onClick={() => workbench.closePalette()}>
            Close
          </button>
        </header>

        <div className="command-list">
          <button type="button" ref={this.ref(firstActionRef)} onClick={() => run(() => workbench.setView("board"))}>Switch to board view</button>
          <button type="button" onClick={() => run(() => workbench.setView("list"))}>Switch to list view</button>
          <button type="button" onClick={() => run(() => workbench.openImport())}>Import JSON</button>
          <button type="button" onClick={() => run(() => workbench.exportTasks())}>Export JSON</button>
          <button type="button" onClick={() => run(() => workbench.resetSampleData())}>Reset sample data</button>
          <button type="button" className="danger-command" onClick={() => run(() => workbench.raiseDemoError())}>Report demo error</button>
        </div>

        {props.selectedTask
          ? (
            <div className="command-section">
              <h3>Move selected task</h3>
              <div className="command-grid">
                {this.map(
                  columns,
                  column => column.id,
                  column => (
                    <button
                      type="button"
                      disabled={props.selectedTask!.status === column.id}
                      onClick={() => run(() => workbench.moveSelected(column.id))}
                    >
                      {column.title}
                    </button>
                  )
                )}
              </div>
            </div>
          )
          : <p className="empty-state">Select a task to reveal move commands.</p>}
      </section>
    </div>
  );
}
