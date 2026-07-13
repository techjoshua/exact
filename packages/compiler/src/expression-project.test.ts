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
});
