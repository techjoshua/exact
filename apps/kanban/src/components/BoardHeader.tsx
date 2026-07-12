import { ErrorContext, type Component } from "@exact/core";
import { BoardContext } from "../context.js";

type BoardHeaderProps = {
  draft: string;
  total: number;
};

/** Renders the kanban sample header and new-task controls. */
export function BoardHeader(this: Component<{}>, props: BoardHeaderProps) {
  const board = this.getContext(BoardContext);
  const errors = this.getContext(ErrorContext);
  const summary = `${props.total} ${props.total == 1 ? "task" : "tasks"} saved locally`;

  return () => (
    <header className="toolbar">
      <div>
        <h1>eXact Kanban</h1>
        <p>{summary}</p>
      </div>
      <div className="toolbar-actions">
        <button
          type="button"
          className="quiet-button"
          onClick={() => {
            errors.report(new Error("Sample reported error"), {
              source: "component",
              phase: "manual"
            });
          }}
        >
          Report error
        </button>
        <button
          type="button"
          className="quiet-button"
          onClick={() => {
            throw new Error("Sample error boundary test");
          }}
        >
          Throw error
        </button>
        <form
          className="new-task"
          onSubmit={event => {
            event.preventDefault();
            board.addTask();
          }}
        >
          <input
            value={props.draft}
            placeholder="Add a task"
            onInput={event => {
              board.setDraft((event.target as HTMLInputElement).value);
            }}
          />
          <button type="submit" disabled={props.draft.trim().length === 0}>
            Add
          </button>
        </form>
      </div>
    </header>
  );
}
