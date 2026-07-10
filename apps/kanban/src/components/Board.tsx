import { createConsoleLogger, LoggerContext, type Component, type Logger } from "@exact/core";
import { px } from "@exact/dom";
import { BoardContext } from "../context.js";
import { columns, createTask, loadTasks, storageKey } from "../data.js";
import type { BoardServices, BoardState, Status, Task } from "../types.js";
import { _ } from "@exact/jsx";
import { BoardHeader } from "./BoardHeader.jsx";
import { ColumnView } from "./ColumnView.jsx";
import { TaskDetailsDialog } from "./TaskDetailsDialog.jsx";

type BoardProps = {
  logger?: Logger;
};

export function Board(this: Component<BoardState>, props: BoardProps) {
  this.setContext(LoggerContext, props.logger ?? createConsoleLogger({ level: "debug" }));

  this.state.tasks = loadTasks();
  this.state.draft = "";
  this.state.selectedTaskId = undefined;
  this.state.dragPlacement = undefined;

  const taskTotal = this.reactive(() => this.state.tasks.length);
  const selectedTask = this.reactive(() => {
    const selectedTaskId = this.state.selectedTaskId;
    return selectedTaskId ? this.state.tasks.find(task => task.id === selectedTaskId) : undefined;
  });

  this.reactive<string>(() => JSON.stringify(this.state.tasks)).task(tasksJson => {
    localStorage.setItem(storageKey, tasksJson);
  });

  const updateTask = (taskId: string, patch: Partial<Pick<Task, "title" | "notes" | "status">>) => {
    const task = this.state.tasks.find(task => task.id === taskId);
    if (!task) return;
    if (patch.title !== undefined) task.title = patch.title;
    if (patch.notes !== undefined) task.notes = patch.notes;
    if (patch.status !== undefined) task.status = patch.status;
  };

  const moveTask = (task: Task, status: Status) => {
    updateTask(task.id, { status });
  };

  const moveTaskById = (taskId: string, status: Status) => {
    updateTask(taskId, { status });
  };

  const reorderTask = (taskId: string, status: Status, beforeTaskId?: string) => {
    const task = this.state.tasks.find(item => item.id === taskId);
    if (!task) return;

    const remaining = this.state.tasks.filter(item => item.id !== taskId);
    task.status = status;
    const insertAt = beforeTaskId
      ? remaining.findIndex(item => item.id === beforeTaskId)
      : findAfterLastColumnTask(remaining, status);

    if (insertAt < 0) {
      this.state.tasks = [...remaining, task];
    } else {
      this.state.tasks = [
        ...remaining.slice(0, insertAt),
        task,
        ...remaining.slice(insertAt)
      ];
    }
  };

  const removeTask = (task: Task) => {
    this.state.tasks = this.state.tasks.filter(item => item.id !== task.id);
    if (this.state.selectedTaskId === task.id) this.state.selectedTaskId = undefined;
  };

  const addTask = () => {
    const title = this.state.draft.trim();
    if (!title) return;

    this.state.tasks = [createTask(title), ...this.state.tasks];
    this.state.draft = "";
  };

  const services: BoardServices = {
    setDraft: value => {
      this.state.draft = value;
    },
    addTask,
    closeTask: () => {
      this.state.selectedTaskId = undefined;
    },
    moveTask,
    moveTaskById,
    previewTaskDrop: (taskId, status, beforeTaskId) => {
      this.state.dragPlacement = {
        taskId,
        status,
        beforeTaskId
      };
    },
    commitTaskDrop: (taskId, status, beforeTaskId) => {
      reorderTask(taskId, status, beforeTaskId);
      this.state.dragPlacement = undefined;
    },
    clearTaskDropPreview: () => {
      this.state.dragPlacement = undefined;
    },
    removeTask,
    updateTask,
    openTask: task => {
      this.state.selectedTaskId = task.id;
    }
  };

  this.setContext(BoardContext, services);

  return () => (
    <main className="shell">
      <BoardHeader
        draft={this.state.draft}
        total={taskTotal as unknown as number}
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
                dragPlacement={this.state.dragPlacement}
              />
            </_>
          )
        )}
      </section>

      {this.state.selectedTaskId ? (
        <TaskDetailsDialog
          key={this.state.selectedTaskId}
          task={selectedTask as unknown as Task}
        />
      ) : null}
    </main>
  );
}

function findAfterLastColumnTask(tasks: Task[], status: Status): number {
  let insertAt = -1;
  for (let index = 0; index < tasks.length; index++) {
    if (tasks[index]!.status === status) insertAt = index + 1;
  }
  return insertAt;
}
