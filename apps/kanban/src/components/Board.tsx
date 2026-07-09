import type { Component } from "@exact/core";
import { px } from "@exact/dom";
import { columns, createTask, loadTasks, storageKey } from "../data.js";
import type { BoardState, Status, Task, TaskActions } from "../types.js";
import { _ } from "./Fragment.jsx";
import { BoardHeader } from "./BoardHeader.jsx";
import { ColumnView } from "./ColumnView.jsx";
import { TaskDetailsDialog } from "./TaskDetailsDialog.jsx";

export function Board(this: Component<BoardState>) {
  this.state.tasks = loadTasks();
  this.state.draft = "";
  this.state.selectedTaskId = undefined;

  this.reactive(this.state.tasks).task(tasks => {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
  });

  const updateTask = (taskId: string, patch: Partial<Pick<Task, "title" | "notes" | "status">>) => {
    this.state.tasks = this.state.tasks.map(task => task.id === taskId ? { ...task, ...patch } : task);
  };

  const moveTask = (task: Task, status: Status) => {
    updateTask(task.id, { status });
  };

  const moveTaskById = (taskId: string, status: Status) => {
    updateTask(taskId, { status });
  };

  const removeTask = (task: Task) => {
    this.state.tasks = this.state.tasks.filter(item => item.id !== task.id);
    if (this.state.selectedTaskId === task.id) this.state.selectedTaskId = undefined;
  };

  const actions: TaskActions = {
    moveTask,
    moveTaskById,
    removeTask,
    updateTask,
    openTask: task => {
      this.state.selectedTaskId = task.id;
    }
  };

  const addTask = () => {
    const title = this.state.draft.trim();
    if (!title) return;

    this.state.tasks = [createTask(title), ...this.state.tasks];
    this.state.draft = "";
  };
  return () => (
    <main className="shell">
      <BoardHeader
        draft={this.state.draft}
        total={this.state.tasks.length}
        setDraft={value => {
          this.state.draft = value;
        }}
        addTask={addTask}
      />

      <section className="board" style={{ gap: px(16) }}>
        {this.map(
          columns,
          column => column.id,
          column => (
            <_ key={column.id}>
              <ColumnView
                column={column}
                tasks={this.state.tasks.filter(task => task.status === column.id)}
                actions={actions}
              />
            </_>
          )
        )}
      </section>

      {this.state.selectedTaskId ? (
        <TaskDetailsDialog
          task={this.state.tasks.find(task => task.id === this.state.selectedTaskId)!}
          actions={actions}
          close={() => {
            this.state.selectedTaskId = undefined;
          }}
        />
      ) : null}
    </main>
  );
}
