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
});
