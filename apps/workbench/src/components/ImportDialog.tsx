import { createRef, type Component } from "@exact/core";
import { WorkbenchContext } from "../context.js";

type ImportDialogProps = {
  value: string;
  error?: string;
};

export function ImportDialog(this: Component<{}>, props: ImportDialogProps) {
  const workbench = this.getContext(WorkbenchContext);
  const importRef = createRef<HTMLTextAreaElement>("import-json");

  this.onMount(() => {
    this.refs.get(importRef)?.focus();
  });

  return () => (
    <div className="dialog-backdrop" onClick={() => workbench.closeImport()}>
      <section className="import-dialog" role="dialog" aria-modal="true" aria-label="Import and export tasks" onClick={event => event.stopPropagation()}>
        <header>
          <div>
            <h2>Import / Export Tasks</h2>
            <p>Paste a task JSON array, or use the current text as an export snapshot.</p>
          </div>
          <button type="button" className="quiet-button" onClick={() => workbench.closeImport()}>
            Close
          </button>
        </header>

        <textarea
          ref={this.ref(importRef)}
          rows={16}
          value={props.value}
          onInput={event => workbench.setImportText((event.currentTarget as HTMLTextAreaElement).value)}
        />

        {props.error ? <p className="form-error">{props.error}</p> : null}

        <footer>
          <button type="button" className="quiet-button" onClick={() => workbench.exportTasks()}>
            Refresh Export
          </button>
          <button type="button" onClick={() => workbench.importTasks()}>
            Import Tasks
          </button>
        </footer>
      </section>
    </div>
  );
}
