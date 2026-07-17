import { describe, expect, it } from "vitest";
import path from "node:path";
import { rmSync, writeFileSync } from "node:fs";
import {
  ExpressionProjectError,
  createExpressionProject,
  expressions,
  rewriteModule
} from "./index.js";

const root = path.resolve(import.meta.dirname, "../../..");
const config = path.join(root, "apps/kanban/tsconfig.json");

describe("@exact/expressions binding", () => {
  it("reuses an unchanged bound overlay without rebuilding", () => {
    const project = createExpressionProject({ tsconfigPath: config });
    const filename = path.join(root, "apps/kanban/src/__expressions_unchanged.ts");
    const source = "export const value = 1;";
    const first = project.updateModule(filename, source);
    const rebuilds = project.stats().rebuilds;
    const second = project.updateModule(filename, source);

    expect(second).toBe(first);
    expect(project.stats().rebuilds).toBe(rebuilds);
  });

  it("refreshes cached disk sources through explicit invalidation", () => {
    const filename = path.join(root, "apps/kanban/src/__expressions_disk_invalidation.ts");
    writeFileSync(filename, "export const value = 1;");
    const project = createExpressionProject({ tsconfigPath: config });
    try {
      expect(project.getModule(filename).emit().code).toContain("value = 1");
      writeFileSync(filename, "export const value = 2;");
      project.invalidateFile(filename);
      expect(project.getModule(filename).emit().code).toContain("value = 2");
    } finally {
      project.dispose();
      rmSync(filename, { force: true });
    }
  });

  it("binds local export specifiers to their declaration identity", () => {
    const project = createExpressionProject({ tsconfigPath: config });
    const filename = path.join(root, "apps/kanban/src/__expressions_export_identity.ts");
    const module = project.updateModule(filename, `const value = 1; export { value as answer };`);
    const references = module.walk().references().where(reference => reference.name === "value").toArray();
    expect(references).toHaveLength(2);
    expect(references[0]!.variable?.id).toBe(references[1]!.variable?.id);
  });

  it("retains node handles when unrelated siblings are inserted before them", () => {
    const project = createExpressionProject({ tsconfigPath: config });
    const filename = path.join(root, "apps/kanban/src/__expressions_node_identity.tsx");
    const source = `export const values = [1, 2];\nexport const view = <section><i /><i />{values.map(value => <span>{value}</span>)}</section>;`;
    const first = project.updateModule(filename, source);
    const firstSection = first.walk().jsxElements().first(node => node.node.tagName === "section")!;
    const firstMap = first.walk().calls().first(call => !!call.target?.isMember("map"))!;
    const firstIdentical = first.walk().jsxElements().where(node => node.node.tagName === "i").toArray().map(node => node.node.id);

    const second = project.updateModule(filename, `export const unrelated = true;\n${source}`);
    const secondSection = second.walk().jsxElements().first(node => node.node.tagName === "section")!;
    const secondMap = second.walk().calls().first(call => !!call.target?.isMember("map"))!;
    const secondIdentical = second.walk().jsxElements().where(node => node.node.tagName === "i").toArray().map(node => node.node.id);

    expect(secondSection.node.id).toBe(firstSection.node.id);
    expect(secondMap.node.id).toBe(firstMap.node.id);
    expect(secondIdentical).toEqual(firstIdentical);
    expect(secondSection.node.span!.start).toBeGreaterThan(firstSection.node.span!.start);
    const ids = second.walk().toArray().map(reference => reference.node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves cross-file imports, generics, overloads, and inferred values", () => {
    const project = createExpressionProject({ tsconfigPath: config });
    const model = path.join(root, "apps/kanban/src/__expressions_model.ts");
    const consumer = path.join(root, "apps/kanban/src/__expressions_consumer.ts");
    const modules = project.updateModules([
      [model, `export interface Box<T> { value: T }\nexport interface RequestOptions { signal?: AbortSignal; label: string }\nexport function box<T>(value: T): Box<T> { return { value }; }\nexport function request(options?: RequestOptions): void { void options; }`],
      [consumer, `import { box, request } from "./__expressions_model.js";\nimport type { Box } from "./__expressions_model.js";\nexport const result = box("ready");\nrequest({ label: "typed" });`]
    ]);
    const module = modules.get(consumer.replace(/\\/g, "/"))!;
    const result = module.walk().references().first(ref => ref.name === "result")!.variable!;
    const box = module.walk().references().first(ref => ref.name === "box")!.variable!;
    const boxType = module.walk().references().first(ref => ref.name === "Box")!.variable!;
    const request = module.walk().references().first(ref => ref.name === "request")!.variable!;

    expect(result.type?.display).toContain("Box<string>");
    expect(box.importedFrom).toBe("./__expressions_model.js");
    expect(box.typeOnly).toBe(false);
    expect(boxType.typeOnly).toBe(true);
    expect(box.type?.callable).toBe(true);
    expect(box.type?.callSignatures[0]?.typeParameters).toEqual(["T"]);
    expect(box.type?.callSignatures[0]?.parameters[0]?.name).toBe("value");
    expect(box.type?.callSignatures[0]?.returnType.display).toContain("Box<T>");
    expect(result.type?.typeArguments[0]?.display).toBe("string");
    const requestOptions = request.type?.callSignatures[0]?.parameters[0]?.type;
    expect(requestOptions?.propertyTypes.find(property => property.name === "signal")?.type.display).toContain("AbortSignal");
    expect(requestOptions?.propertyTypes.find(property => property.name === "label")?.type.display).toBe("string");
    expect(module.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
  });

  it("projects directives from cross-file types and callable contracts", () => {
    const project = createExpressionProject({ tsconfigPath: config });
    const model = path.join(root, "apps/kanban/src/__expressions_directive_model.ts");
    const consumer = path.join(root, "apps/kanban/src/__expressions_directive_consumer.ts");
    const modules = project.updateModules([
      [model, `export interface Task { /** @exact key */ id: string; title: string }
        export declare function select<T>(/** @exact track */ calculate: () => T): T;`],
      [consumer, `import { select, type Task } from "./__expressions_directive_model.js";
        declare const tasks: Task[]; tasks.map(task => task.title); select(() => tasks.length);`]
    ]);
    const module = modules.get(consumer.replace(/\\/g, "/"))!;
    const map = module.walk().calls().first(call => call.target?.isMember("map") === true)!;
    const select = module.walk().calls().first(call => call.target?.name === "select")!;
    expect(map.target?.target?.type?.typeArguments[0]?.propertyTypes.find(property => property.name === "id")?.directives)
      .toContainEqual(expect.objectContaining({ namespace: "exact", key: "key" }));
    expect(select.node.resolvedSignature?.parameters[0]?.directives)
      .toContainEqual(expect.objectContaining({ namespace: "exact", key: "track" }));
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
    if (rewritten.state !== "unbound") throw new Error("A structural rewrite must require rebinding");
    await expect(project.bind(rewritten)).rejects.toBeInstanceOf(ExpressionProjectError);
  });

  it("refuses checked emission when TypeScript reports errors", () => {
    const project = createExpressionProject({ tsconfigPath: config });
    const filename = path.join(root, "apps/kanban/src/__expressions_type_error.ts");
    const module = project.updateModule(filename, `const value: number = "wrong";`);
    expect(() => project.emit(module)).toThrow(ExpressionProjectError);
    expect(() => project.emit(module)).toThrow(/__expressions_type_error\.ts:1:7 - TS2322:/);
    expect(module.emit().code).toContain('"wrong"');
  });

  it("retains complete recursive package-owned type graphs", () => {
    const project = createExpressionProject({ tsconfigPath: config });
    const filename = path.join(root, "apps/kanban/src/__expressions_recursive_type.ts");
    const module = project.updateModule(filename, `interface Link { value: string; next?: Link } const link: Link = { value: "root" };`);
    const link = module.walk().references().where(reference => reference.name === "link").first()!.variable!.type!;
    const next = link.propertyTypes.find(property => property.name === "next")!.type;
    const recursive = next.unionMembers.find(member => member.display === "Link") ?? next;
    expect(recursive.properties).toEqual(expect.arrayContaining(["value", "next"]));
  });

  it("delegates structural assignability to the current TypeChecker generation", () => {
    const project = createExpressionProject({ tsconfigPath: config });
    const filename = path.join(root, "apps/kanban/src/__expressions_assignability.ts");
    const module = project.updateModule(filename, `
      const source = { value: 1 };
      let compatible: { value: number };
      let incompatible: { value: number; required: string };
    `);
    const type = (name: string) => module.walk().references().where(reference => reference.name === name).first()!.variable!.type!;
    expect(project.isAssignable(type("source"), type("compatible"))).toBe(true);
    expect(project.isAssignable(type("source"), type("incompatible"))).toBe(false);
  });
});
