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
});
