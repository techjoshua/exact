import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  createExpressionProject,
  expressions,
  lowerModuleText,
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
    expect(module.walk().calls().where(call => call.target?.isMember("filter") === true).any()).toBe(true);
    const elements = module.walk().jsxElements().toArray();
    expect(elements.length).toBeGreaterThan(5);
    expect(elements.some(element => element.node.tagName === "TaskCard")).toBe(true);
    expect(elements.every(element => Array.isArray(element.node.attributes) && Array.isArray(element.node.jsxChildren))).toBe(true);
    expect(module.walk().jsxAttributes().any(attribute => attribute.node.name === "className")).toBe(true);
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

  it("binds shorthand property values to their lexical variables", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__shorthand.ts");
    const module = project.updateModule(filename, "const signal = new AbortController().signal; const options = { signal };");
    const signalReferences = module.walk().references()
      .where(reference => reference.name === "signal" && reference.parent?.node.kind !== "PropertyAccessExpression")
      .toArray();
    expect(signalReferences.length).toBeGreaterThanOrEqual(2);
    expect(new Set(signalReferences.map(reference => reference.variable))).toHaveLength(1);
  });

  it("reports subtree dependencies and read/write effects for compound updates", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__effects.ts");
    const module = project.updateModule(filename, "let total = 1; const add = (value: number) => total += value;");
    const assignment = module.walk().assignments().where(reference => reference.node.operator === "+=").single();
    expect(module.dependenciesOf(assignment).map(variable => variable.name).sort()).toEqual(["total", "value"]);
    expect(module.writesOf(assignment).map(variable => variable.name)).toEqual(["total"]);
    const totalEffects = module.effectsOf(assignment)
      .filter(effect => effect.variable.name === "total" && effect.kind !== "capture")
      .map(effect => effect.kind);
    expect(totalEffects).toEqual(["read", "write"]);
  });

  it("builds immutable control-flow graphs with branch and terminal edges", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__control_flow.ts");
    const module = project.updateModule(filename, `function choose(value: number) {
      if (value > 0) return 1;
      value++;
      return value;
    }`);
    const fn = module.walk().functions().single();
    const graph = module.controlFlowOf(fn);
    const branch = graph.nodes.find(node => node.expression.kind === "IfStatement")!;
    const firstReturn = graph.nodes.find(node => node.expression.kind === "ReturnStatement")!;
    const update = graph.nodes.find(node => node.expression.kind === "ExpressionStatement")!;
    expect(branch.successors).toEqual(expect.arrayContaining([firstReturn.id, update.id]));
    expect(firstReturn.successors).toEqual([]);
    expect(graph.exits.filter(id => graph.byId.get(id)?.terminal)).toHaveLength(2);
    expect(module.controlFlowOf(fn)).toBe(graph);
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

  it("constructs classes, generics, async code, closures, objects, arrays, and JSX", async () => {
    const filename = path.join(root, "apps/kanban/src/__generated_rich_expression.tsx");
    const builder = expressions.module(filename);
    const number = builder.types.number();
    const genericT = builder.types.named("T");
    const promise = builder.ambient("Promise", builder.types.named("PromiseConstructor"));

    builder.exportClass("Counter", value => {
      value.property("count", number, builder.literal(0));
      value.method("increment", method => {
        method.expression(builder.assignment(builder.member(builder.thisValue(), "count"), builder.literal(1), "+="));
        method.returns(builder.member(builder.thisValue(), "count"));
      }, { returnType: number });
    });
    builder.function("resolveValue", fn => {
      const input = fn.parameter("input", genericT);
      const factor = fn.variable("factor", builder.literal(2), number);
      const multiply = fn.arrow(inner => {
        const value = inner.parameter("value", number);
        return builder.multiply(builder.reference(value), builder.reference(factor));
      }, { returnType: number });
      fn.variable("multiply", multiply);
      fn.expression(builder.object({ values: builder.array(builder.literal(1), builder.literal(2)) }));
      fn.returns(builder.await(builder.call(builder.member(builder.reference(promise), "resolve"), builder.reference(input))));
    }, {
      exported: true,
      async: true,
      typeParameters: ["T"],
      returnType: builder.types.generic("Promise", genericT)
    });
    builder.exportFunction("View", fn => {
      const label = fn.parameter("label", builder.types.string());
      fn.returns(builder.jsx("section", { class: "counter" }, builder.jsx("span", {}, builder.reference(label))));
    });

    const unbound = builder.build();
    expect(unbound.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
    expect(unbound.emit().code).toContain("export class Counter");
    expect(unbound.emit().code).toContain("export async function resolveValue<T>");
    expect(unbound.emit().code).toContain("<section class=\"counter\">");

    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const bound = await project.bind(unbound);
    expect(bound.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
    const multiplyArrow = bound.walk().functions().where(ref => ref.node.kind === "ArrowFunction").single();
    expect(bound.capturesOf(multiplyArrow).map(variable => variable.name)).toContain("factor");
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

  it("preserves directives, comments, and newline style around structural edits", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__expressions_trivia.ts");
    const source = `"use strict";\r\n// retained for the following region\r\nconst first = 1;\r\nconst second = 2;\r\n`;
    const module = project.updateModule(filename, source);
    const generated = expressions.module("generated.ts");
    generated.exportFunction("inserted", fn => fn.returns(generated.literal(3)));
    const declaration = generated.build().root.node.children[0]!;
    const rewritten = rewriteModule(module, rewriter => {
      const second = module.walk().first(ref => ref.node.text === "const second = 2;")!;
      rewriter.insertBefore(second, declaration);
    });

    expect(rewritten.emit().code).toBe(`"use strict";\r\n// retained for the following region\r\nconst first = 1;\r\nexport function inserted() {\r\n  return 3;\r\n}\r\nconst second = 2;\r\n`);
    expect(rewritten.trivia.directives).toEqual(["use strict"]);
  });

  it("supports scope-safe generated text rewrites followed by checked rebinding", async () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__text_rewrite.ts");
    const module = project.updateModule(filename, "export const value = 1 + 2;\n");
    const rewritten = rewriteModule(module, rewriter => {
      rewriter.replaceTextWhere(ref => ref.node.kind === "BinaryExpression", ref => `(${ref.node.text}) * 3`);
    });
    expect(rewritten.validate().filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
    const rebound = await project.bind(rewritten);
    expect(rebound.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
    expect(rebound.emit().code).toContain("(1 + 2) * 3");
  });

  it("composes nested text lowerings against one stable source tree", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__composed_lowering.ts");
    const module = project.updateModule(filename, "// keep\nexport const value = 1 + 2;\n");
    const output = lowerModuleText(module, ({ reference, text }) => {
      if (reference.node.kind === "NumericLiteral") return String(Number(text) * 10);
      if (reference.node.kind === "BinaryExpression") return `(${text})`;
      return undefined;
    });
    expect(output).toBe("// keep\nexport const value = (10 + 20);\n");
  });

  it("keeps earlier module versions and analyses immutable", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__expressions_versions.ts");
    const first = project.updateModule(filename, "let value = 1; value += 2;");
    const firstEffects = first.effects();
    const second = project.updateModule(filename, "// unrelated insertion\nlet value = 1; value += 3;");

    expect(second.version).toBeGreaterThan(first.version);
    expect(first.emit().code).toContain("+= 2");
    expect(second.emit().code).toContain("+= 3");
    expect(first.effects()).toBe(firstEffects);
    const firstVariable = first.walk().references().first(ref => ref.name === "value")!.variable!;
    const secondVariable = second.walk().references().first(ref => ref.name === "value")!.variable!;
    expect(secondVariable.id).toBe(firstVariable.id);
    expect(secondVariable).not.toBe(firstVariable);
  });

  it("uses host filesystem casing rules for incremental overlays", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const lower = path.join(root, "apps/kanban/src/__case_overlay.ts");
    const upper = path.join(root, "apps/kanban/src/__CASE_OVERLAY.ts");
    project.updateModule(lower, "export const lower = 1;");
    const latest = project.updateModule(upper, "export const upper = 2;");
    expect(latest.emit().code).toContain("upper = 2");
    if (process.platform === "win32") expect(project.getModule(lower).emit().code).toContain("upper = 2");
  });
});
