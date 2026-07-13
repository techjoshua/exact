import { describe, expect, it } from "vitest";
import { clearExpressionProjectCache, expressionModuleFor } from "./expression-project.js";
import { analyzeExpressionTasks } from "./expression-tasks.js";

describe("expression-backed task effects", () => {
  it("classifies state, context, environment, async, and explicit placement effects", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("ExpressionTasks.tsx", `
      import { readFile } from "node:fs/promises";
      function Panel(this: Component<{ count: number; items: string[] }>) {
        this.task.client(async ({ signal }) => {
          const items = this.state.items;
          this.state.count += items.length;
          items.push(await readFile("x", "utf8"));
          this.getContext(Locale);
          window.addEventListener("resize", () => {}, { signal });
        });
        return () => <p />;
      }
    `);
    const task = [...analyzeExpressionTasks(module).sites.values()][0]!;
    expect(task.component).toBe("Panel");
    expect(task.requestedPlacement).toBe("client");
    expect(task.placement).toBe("client");
    expect(task.async).toBe(true);
    expect(task.browserEffects).toBe(true);
    expect(task.serverEffects).toBe(true);
    expect(task.reads).toEqual(expect.arrayContaining([expect.objectContaining({ path: "items" })]));
    expect(task.writes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "count" }),
      expect.objectContaining({ path: "items", confidence: "broad" })
    ]));
    expect(task.contexts).toContainEqual(expect.objectContaining({ token: "Locale", kind: "read" }));
    expect(task.diagnostics).toEqual(expect.arrayContaining([
      "task writes component state and references browser-only globals; classify as client and split at this boundary",
      "error: this.task.client() cannot reference server-only imports",
      "task placement forced by this.task.client()"
    ]));
  });
});
