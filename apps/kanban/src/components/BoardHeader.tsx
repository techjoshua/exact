import type { Component } from "@exact/core";

type BoardHeaderProps = {
  draft: string;
  total: number;
  setDraft(value: string): void;
  addTask(): void;
};

export function BoardHeader(this: Component<{}>, props: BoardHeaderProps) {
  const summary = this.reactive(() => `${props.total} ${props.total == 1 ? "task" : "tasks"} saved locally`);

  return () => (
    <header className="toolbar">
      <div>
        <h1>eXact Kanban</h1>
        <p>{summary}</p>
      </div>
      <form
        className="new-task"
        onSubmit={event => {
          event.preventDefault();
          props.addTask();
        }}
      >
        <input
          value={props.draft}
          placeholder="Add a task"
          onInput={event => {
            props.setDraft((event.target as HTMLInputElement).value);
          }}
        />
        <button type="submit" disabled={props.draft.trim().length === 0}>
          Add
        </button>
      </form>
    </header>
  );
}
