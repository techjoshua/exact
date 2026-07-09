import { type Component } from "@exact/core";
import { px, render } from "@exact/dom";
import "./styles.css";

type Status = "todo" | "doing" | "done";

type Task = {
  id: string;
  title: string;
  status: Status;
};

type Column = {
  id: Status;
  title: string;
};

type BoardState = {
  tasks: Task[];
  draft: string;
};

const storageKey = "exact.sample.kanban";
function _(this: Component<{}>, _props: { children?: unknown }) {
  return () => null;
}

const columns: Column[] = [
  { id: "todo", title: "To do" },
  { id: "doing", title: "Doing" },
  { id: "done", title: "Done" }
];

const seedTasks: Task[] = [
  { id: "task-1", title: "Sketch compiler sample", status: "todo" },
  { id: "task-2", title: "Wire localStorage", status: "doing" },
  { id: "task-3", title: "Keep JSX boring", status: "done" }
];

function Board(this: Component<BoardState>) {
  this.state.tasks = loadTasks();
  this.state.draft = "";

  this.reactive(this.state.tasks).task(tasks => {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
  });

  const total = this.reactive(this.state.tasks.length);

  const addTask = () => {
    const title = this.state.draft.trim();
    if (!title) return;

    this.state.tasks = [
      { id: crypto.randomUUID(), title, status: "todo" },
      ...this.state.tasks
    ];
    this.state.draft = "";
  };

  const moveTask = (task: Task, status: Status) => {
    this.state.tasks = this.state.tasks.map(item => item.id === task.id ? { ...item, status } : item);
  };

  const removeTask = (task: Task) => {
    this.state.tasks = this.state.tasks.filter(item => item.id !== task.id);
  };

  return () => (
    <main className="shell">
      <header className="toolbar">
        <div>
          <h1>eXact Kanban</h1>
          <p>{total} tasks saved locally</p>
        </div>
        <form
          className="new-task"
          onSubmit={event => {
            event.preventDefault();
            addTask();
          }}
        >
          <input
            value={this.state.draft}
            placeholder="Add a task"
            onInput={event => {
              this.state.draft = (event.target as HTMLInputElement).value;
            }}
          />
          <button type="submit" disabled={this.state.draft.trim().length === 0}>
            Add
          </button>
        </form>
      </header>

      <section className="board" style={{ gap: px(16) }}>
        {this.map(
          columns,
          column => column.id,
          column => (
            <_ key={column.id}>
              <ColumnView
                column={column}
                tasks={this.state.tasks.filter(task => task.status === column.id)}
                moveTask={moveTask}
                removeTask={removeTask}
              />
            </_>
          )
        )}
      </section>
    </main>
  );
}

function ColumnView(
  this: Component<{}>,
  props: {
    column: Column;
    tasks: Task[];
    moveTask(task: Task, status: Status): void;
    removeTask(task: Task): void;
  }
) {
  const countLabel = this.reactive(props.tasks.length === 1 ? "1 task" : `${props.tasks.length} tasks`);

  return () => (
    <article className={["column", { empty: props.tasks.length === 0 }]}>
      <header>
        <h2>{props.column.title}</h2>
        <span>{countLabel}</span>
      </header>

      <div className="cards">
        {props.tasks.length === 0 ? (
          <p className="empty-state">Nothing here</p>
        ) : (
          this.map(
            props.tasks,
            task => task.id,
            task => (
              <TaskCard
                task={task}
                moveTask={props.moveTask}
                removeTask={props.removeTask}
              />
            )
          )
        )}
      </div>
    </article>
  );
}

function TaskCard(
  this: Component<{}>,
  props: {
    task: Task;
    moveTask(task: Task, status: Status): void;
    removeTask(task: Task): void;
  }
) {
  return () => (
    <div className="card">
      <p>{props.task.title}</p>
      <div className="card-actions">
        <select
          value={props.task.status}
          onChange={event => props.moveTask(props.task, (event.target as HTMLSelectElement).value as Status)}
        >
          <option value="todo">To do</option>
          <option value="doing">Doing</option>
          <option value="done">Done</option>
        </select>
        <button type="button" onClick={() => props.removeTask(props.task)}>
          Remove
        </button>
      </div>
    </div>
  );
}

function loadTasks(): Task[] {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return seedTasks;

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(isTask) : seedTasks;
  } catch {
    return seedTasks;
  }
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<Task>;
  return typeof task.id === "string"
    && typeof task.title === "string"
    && (task.status === "todo" || task.status === "doing" || task.status === "done");
}

render(<Board />, document.getElementById("app")!);
