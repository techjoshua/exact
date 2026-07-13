import { describe, expect, it } from "vitest";
import { analyzeReactiveProvenance, clearExpressionProjectCache } from "./index.js";

describe("expression-backed reactive provenance", () => {
  it("classifies calculated locals and explicit snapshots through canonical variables", () => {
    clearExpressionProjectCache();
    const graph = analyzeReactiveProvenance(`
      declare function peek<T>(read: () => T): T;
      export function Board(this: { state: { tasks: { done: boolean }[] } }) {
        const visible = this.state.tasks.filter(task => !task.done);
        const snapshot = peek(() => this.state.tasks);
        return <section>{visible.length}:{snapshot.length}</section>;
      }
    `, { filename: "provenance.tsx" });

    const visible = graph.entries.find(entry => entry.variable.name === "visible");
    const snapshot = graph.entries.find(entry => entry.variable.name === "snapshot");
    expect(visible?.provenance).toBe("derived");
    expect(visible?.dependencies.some(variable => variable.name === "state")).toBe(true);
    expect(snapshot?.provenance).toBe("snapshot");
  });

  it("propagates reactivity through collection callbacks and JSX cells", () => {
    clearExpressionProjectCache();
    const graph = analyzeReactiveProvenance(`
      export function Column(props: { tasks: { status: string }[]; status: string }) {
        const visible = props.tasks.filter(task => task.status === props.status);
        return <section>{visible.map(task => task.status)}</section>;
      }
    `, { filename: "column-provenance.tsx" });

    expect(graph.entries.find(entry => entry.variable.name === "props")?.provenance).toBe("props");
    expect(graph.entries.find(entry => entry.variable.name === "visible")?.provenance).toBe("derived");
    expect(graph.entries.filter(entry => entry.variable.name === "task").every(entry => entry.provenance === "derived")).toBe(true);
    expect(graph.cells).toHaveLength(1);
    expect(graph.cells[0]!.kind).toBe("jsx-child");
  });
});
