import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  createExpressionProject,
  expressions,
  rewriteModule
} from "./index.js";

const root = path.resolve(import.meta.dirname, "../../..");
const kanbanConfig = path.join(root, "apps/kanban/tsconfig.json");

describe("@exact/expressions", () => {
  it("preserves source and exposes fluent typed JSX queries", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/components/ColumnView.tsx");
    const module = project.getModule(filename);

    expect(module.emit().code).toContain("export function ColumnView");
    expect(module.walk().functions().any()).toBe(true);
    expect(module.walk().calls().any()).toBe(true);
    expect(module.walk().jsxElements().toArray().length).toBeGreaterThan(5);
    expect(module.root.descendants().first()?.parent).toBeDefined();
  });

  it("uses one canonical variable object for every binding use", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__expressions_identity.ts");
    const source = `const outer = 1;
export function total(items: number[]) {
  const local = 2;
  return items.map(item => item + outer + local);
}`;
    const module = project.updateModule(filename, source);
    const identifiers = module.walk().where(ref => ref.node.kind === "Identifier").toArray();
    const outerUses = identifiers.filter(ref => ref.node.name === "outer").map(ref => ref.node.variable);
    const localUses = identifiers.filter(ref => ref.node.name === "local").map(ref => ref.node.variable);

    expect(new Set(outerUses).size).toBe(1);
    expect(new Set(localUses).size).toBe(1);
    const arrow = module.walk().functions().where(ref => ref.node.kind === "ArrowFunction").single();
    expect(module.capturesOf(arrow).map(variable => variable.name).sort()).toEqual(["local", "outer"]);
  });

  it("constructs, emits, and binds typed modules programmatically", async () => {
    const builder = expressions.module(path.join(root, "apps/kanban/src/__generated_expression.ts"));
    const number = builder.types.number();
    builder.exportFunction("double", fn => {
      const input = fn.parameter("input", number);
      fn.returns(builder.multiply(builder.reference(input), builder.literal(2)));
    });
    const unbound = builder.build();

    expect(unbound.state).toBe("unbound");
    expect(unbound.emit().code).toContain("export function double(input: number)");

    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const bound = await project.bind(unbound);
    expect(bound.state).toBe("bound");
    expect(bound.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
    expect(bound.walk().functions().single().node.name).toBe("double");
  });

  it("rewrites source losslessly outside the selected node", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__expressions_rewrite.ts");
    const source = `// retained comment\nconst value = 1;\nexport { value };\n`;
    const module = project.updateModule(filename, source);
    const replacement = expressions.module("replacement.ts").literal(2);
    const rewritten = rewriteModule(module, rewriter => {
      rewriter.replaceWhere(ref => ref.node.text === "1", () => replacement);
    });

    expect(rewritten.emit().code).toBe(`// retained comment\nconst value = 2;\nexport { value };\n`);
    expect(rewritten.state).toBe("unbound");
  });

  it("keeps earlier module versions and analyses immutable", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__expressions_versions.ts");
    const first = project.updateModule(filename, "let value = 1; value += 2;");
    const firstEffects = first.effects();
    const second = project.updateModule(filename, "let value = 1; value += 3;");

    expect(second.version).toBeGreaterThan(first.version);
    expect(first.emit().code).toContain("+= 2");
    expect(second.emit().code).toContain("+= 3");
    expect(first.effects()).toBe(firstEffects);
  });
});
