import { describe, expect, it } from "vitest";
import { clearExpressionProjectCache, expressionModuleFor } from "./expression-project.js";
import { analyzeExpressionTasks } from "./expression-tasks.js";

describe("expression-backed task effects", () => {
  it("does not classify shadowed async resource functions as globals", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("ShadowedTaskResources.tsx", `
      function Panel(this: Component<{}>) {
        const setTimeout = (callback: () => void) => callback();
        this.task(() => setTimeout(() => {}));
      }
    `);
    expect(analyzeExpressionTasks(module).resources.size).toBe(0);
  });
  it("plans direct component setup listeners for implicit lifecycle ownership", () => {
    clearExpressionProjectCache();
    const module = expressionModuleFor("SetupListener.tsx", `function Panel(this: Component<{}>) {
      window.addEventListener("resize", () => {});
      const window = undefined as never;
      return () => <p />;
    }`);
    // The lexical declaration shadows every use in its scope, including the earlier one.
    expect(analyzeExpressionTasks(module).lifecycleListeners.size).toBe(0);

    const globalModule = expressionModuleFor("GlobalSetupListener.tsx", `function Panel(this: Component<{}>) {
      window.addEventListener("resize", () => {});
      return () => <p />;
    }`);
    expect([...analyzeExpressionTasks(globalModule).lifecycleListeners.values()])
      .toContainEqual(expect.objectContaining({ component: "Panel" }));
  });
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
          setTimeout(() => {}, 10);
          fetch("/tasks");
          new ResizeObserver(() => {});
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
    expect([...analyzeExpressionTasks(module).resources.values()].map(resource => resource.kind)).toEqual(
      expect.arrayContaining(["timeout", "fetch", "observer"])
    );
    expect(task.diagnostics).toEqual(expect.arrayContaining([
      "task writes component state and references browser-only globals; classify as client and split at this boundary",
      "error: this.task.client() cannot reference server-only imports",
      "task placement forced by this.task.client()"
    ]));
  });
});
