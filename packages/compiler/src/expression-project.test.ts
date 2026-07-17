import path from "node:path";
import { describe, expect, it } from "vitest";
import { clearExpressionProjectCache, expressionModuleFor } from "./expression-project.js";

describe("shared expression projects", () => {
  it("caches modules by canonical filename within one project", () => {
    clearExpressionProjectCache();
    const root = path.resolve(import.meta.dirname, "../../..");
    const firstFile = path.join(root, "apps/kanban/src/__cache_first.ts");
    const secondFile = path.join(root, "apps/kanban/src/__cache_second.ts");
    const source = "export const same = 1;";
    const first = expressionModuleFor(firstFile, source);
    const second = expressionModuleFor(secondFile, source);
    expect(first.filename).not.toBe(second.filename);
    expect(first).not.toBe(second);
    expect(expressionModuleFor(firstFile, source)).toBe(first);
  });

  it("rebinds unchanged consumers after a dependency revision", () => {
    clearExpressionProjectCache();
    const root = path.resolve(import.meta.dirname, "../../..");
    const model = path.join(root, "apps/kanban/src/__cache_model.ts");
    const consumer = path.join(root, "apps/kanban/src/__cache_consumer.ts");
    const consumerSource = 'import { value } from "./__cache_model.js"; export const result = value;';
    expressionModuleFor(model, "export const value = 1;");
    const first = expressionModuleFor(consumer, consumerSource);
    expect(first.walk().references().first(reference => reference.name === "result")?.variable?.type?.kind).toBe("number");
    expressionModuleFor(model, 'export const value = "changed";');
    const rebound = expressionModuleFor(consumer, consumerSource);
    expect(rebound).not.toBe(first);
    expect(rebound.walk().references().first(reference => reference.name === "result")?.variable?.type?.kind).toBe("string");
  });

  it("invalidates consumers of side-effect-only imports resolved by TypeScript", () => {
    clearExpressionProjectCache();
    const root = path.resolve(import.meta.dirname, "../../..");
    const setup = path.join(root, "apps/kanban/src/__cache_setup.ts");
    const consumer = path.join(root, "apps/kanban/src/__cache_side_effect.ts");
    const source = 'import "./__cache_setup.js"; export const ready = true;';
    expressionModuleFor(setup, "globalThis.name = 'first';");
    const first = expressionModuleFor(consumer, source);
    expressionModuleFor(setup, "globalThis.name = 'second';");
    expect(expressionModuleFor(consumer, source)).not.toBe(first);
  });

  it("shares relative filenames through a configured package workspace", () => {
    clearExpressionProjectCache();
    const root = path.resolve(import.meta.dirname, "../../..");
    expressionModuleFor("apps/kanban/src/__relative_cache_model.ts", "export const value = 1;", { root });
    const consumer = expressionModuleFor(
      "apps/kanban/src/__relative_cache_consumer.ts",
      'import { value } from "./__relative_cache_model.js"; export const result = value;',
      { root }
    );
    expect(consumer.walk().references().first(reference => reference.name === "result")?.variable?.type?.kind).toBe("number");
  });

  it("keeps script-mode relative snippets isolated inside the shared workspace", () => {
    clearExpressionProjectCache();
    const first = expressionModuleFor("__relative_first.ts", "const sharedName = 1;");
    const second = expressionModuleFor("__relative_second.ts", "const sharedName = 2;");
    expect(first.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
    expect(second.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
  });
});
