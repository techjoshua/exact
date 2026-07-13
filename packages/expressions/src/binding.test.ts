import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  ExpressionProjectError,
  createExpressionProject,
  expressions,
  rewriteModule
} from "./index.js";

const root = path.resolve(import.meta.dirname, "../../..");
const config = path.join(root, "apps/kanban/tsconfig.json");

describe("@exact/expressions binding", () => {
  it("resolves cross-file imports, generics, overloads, and inferred values", () => {
    const project = createExpressionProject({ tsconfigPath: config });
    const model = path.join(root, "apps/kanban/src/__expressions_model.ts");
    const consumer = path.join(root, "apps/kanban/src/__expressions_consumer.ts");
    const modules = project.updateModules([
      [model, `export interface Box<T> { value: T }\nexport function box<T>(value: T): Box<T> { return { value }; }`],
      [consumer, `import { box } from "./__expressions_model.js";\nexport const result = box("ready");`]
    ]);
    const module = modules.get(consumer.replace(/\\/g, "/"))!;
    const result = module.walk().references().first(ref => ref.name === "result")!.variable!;
    const box = module.walk().references().first(ref => ref.name === "box")!.variable!;

    expect(result.type?.display).toContain("Box<string>");
    expect(box.importedFrom).toBe("./__expressions_model.js");
    expect(box.type?.callable).toBe(true);
    expect(module.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
  });

  it("rejects structurally invalid rewrites before TypeScript binding", async () => {
    const project = createExpressionProject({ tsconfigPath: config });
    const filename = path.join(root, "apps/kanban/src/__expressions_invalid.ts");
    const source = project.updateModule(filename, "export const value = 1;");
    const foreign = expressions.module("foreign.ts");
    const inaccessible = foreign.variable("hidden", foreign.types.number());
    const rewritten = rewriteModule(source, rewriter => {
      rewriter.replaceWhere(ref => ref.node.text === "1", () => foreign.reference(inaccessible));
    });

    expect(rewritten.validate().map(diagnostic => diagnostic.code)).toContain("EXPR_FOREIGN_SCOPE");
    await expect(project.bind(rewritten)).rejects.toBeInstanceOf(ExpressionProjectError);
  });

  it("refuses checked emission when TypeScript reports errors", () => {
    const project = createExpressionProject({ tsconfigPath: config });
    const filename = path.join(root, "apps/kanban/src/__expressions_type_error.ts");
    const module = project.updateModule(filename, `const value: number = "wrong";`);
    expect(() => project.emit(module)).toThrow(ExpressionProjectError);
    expect(module.emit().code).toContain('"wrong"');
  });
});
