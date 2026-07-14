import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  cloneWithVariables,
  createExpressionProject,
  expressions,
  lowerModuleText,
  rewriteModule,
  validateExpressionTree
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

  it("encapsulates binding mutability on canonical variables", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__expressions_mutability.ts");
    const module = project.updateModule(filename, `const fixed = 1; let changing = 2; function update(parameter: number) { changing = parameter; return fixed; }`);
    const variables = new Map(module.walk().references().toArray().flatMap(reference => reference.variable ? [[reference.variable.name, reference.variable] as const] : []));

    expect(variables.get("fixed")?.mutable).toBe(false);
    expect(variables.get("changing")?.mutable).toBe(true);
    expect(variables.get("parameter")?.mutable).toBe(true);
    expect(variables.get("update")?.mutable).toBe(false);
  });

  it("represents lexical this reads with their canonical binding", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__this_identity.ts");
    const module = project.updateModule(filename, `function Card(this: { state: { title: string } }) {
      const read = () => this.state.title;
      return read();
    }`);
    const thisReferences = module.walk().references().where(reference => reference.name === "this").toArray();
    expect(thisReferences).toHaveLength(1);
    const fn = module.walk().functions().where(reference => reference.node.kind === "FunctionDeclaration").single();
    expect(fn.node.parameters[0]).toBe(thisReferences[0]!.variable);
    const arrow = module.walk().functions().where(reference => reference.node.kind === "ArrowFunction").single();
    expect(module.dependenciesOf(arrow).map(variable => variable.name)).toContain("this");
    expect(module.capturesOf(arrow).map(variable => variable.name)).toContain("this");
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

  it("distinguishes member storage reads from property writes", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__member_effects.ts");
    const module = project.updateModule(filename, "const model = { value: 1 }; model.value = 2;");
    const assignment = module.walk().assignments().single();
    expect(module.dependenciesOf(assignment).map(variable => variable.name)).toEqual(["model"]);
    expect(module.writesOf(assignment).map(variable => variable.name)).toEqual(["value"]);
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

  it("models switch fallthrough, loop control, and finally execution", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__expressions_control_edges.ts");
    const module = project.updateModule(filename, `function run(value: number) {
      while (value--) { if (value === 2) continue; if (value === 1) break; }
      switch (value) { case 0: value++; case 1: value++; break; default: return value; }
      try { return value; } finally { value++; }
    }`);
    const graph = module.controlFlowOf(module.walk().functions().single());
    const flow = (kind: string) => graph.nodes.filter(node => node.expression.kind === kind);
    expect(flow("ContinueStatement")[0]?.successors.length).toBe(1);
    expect(flow("BreakStatement").some(node => node.successors.length === 1)).toBe(true);
    expect(flow("ReturnStatement").some(node => node.successors.some(id => graph.byId.get(id)?.expression.kind === "ExpressionStatement"))).toBe(true);
  });

  it("models catch paths as exceptions rather than normal branches", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__expressions_exception_edges.ts");
    const module = project.updateModule(filename, `function run() { try { work(); } catch { recover(); } finally { cleanup(); } }`);
    const graph = module.controlFlowOf(module.walk().functions().single());
    const work = graph.nodes.find(node => node.expression.kind === "ExpressionStatement" && node.expression.text?.includes("work()"))!;
    const catchEdge = work.successorEdges.find(edge => edge.kind === "exception");
    expect(catchEdge).toBeDefined();
    expect(graph.byId.get(catchEdge!.target)?.expression.text).toContain("recover()");
    expect(graph.nodes.some(node => node.successorEdges.some(edge => edge.kind === "finally"))).toBe(true);
  });

  it("does not route guaranteed non-throwing abrupt completion into catch", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__expressions_precise_exception_edges.ts");
    const module = project.updateModule(filename, `function bare() { try { return; } catch { recover(); } }
      function evaluated() { try { return work(); } catch { recover(); } }
      function thrown() { try { throw new Error(); } catch { recover(); } }`);
    const graphs = module.walk().functions().toArray().map(fn => module.controlFlowOf(fn));
    const bareReturn = graphs[0]!.nodes.find(node => node.expression.kind === "ReturnStatement")!;
    const evaluatedReturn = graphs[1]!.nodes.find(node => node.expression.kind === "ReturnStatement")!;
    const thrown = graphs[2]!.nodes.find(node => node.expression.kind === "ThrowStatement")!;
    expect(bareReturn.successorEdges.some(edge => edge.kind === "exception")).toBe(false);
    expect(evaluatedReturn.successorEdges.some(edge => edge.kind === "exception")).toBe(true);
    expect(thrown.successorEdges.some(edge => edge.kind === "exception")).toBe(true);
    expect(graphs[2]!.exits).not.toContain(thrown.id);
  });

  it("routes labeled loop jumps through finally and excludes unreachable exits", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__expressions_labeled_finally.ts");
    const module = project.updateModule(filename, `function run(values: number[]) {
      outer: for (const value of values) {
        try {
          if (value < 0) continue outer;
          if (value === 0) break outer;
        } finally { cleanup(value); }
      }
      return 1;
      cleanup(never);
    }`);
    const graph = module.controlFlowOf(module.walk().functions().single());
    const jumps = graph.nodes.filter(node => node.expression.kind === "BreakStatement" || node.expression.kind === "ContinueStatement");
    expect(jumps).toHaveLength(2);
    expect(jumps.every(node => node.successorEdges.some(edge => edge.kind === "finally"))).toBe(true);
    const unreachable = graph.nodes.find(node => node.expression.text?.includes("cleanup(never)"))!;
    expect(unreachable.predecessors).toEqual([]);
    expect(graph.exits).not.toContain(unreachable.id);
  });

  it("preserves pending completion through normally completing finalizer branches", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__expressions_conditional_finally.ts");
    const module = project.updateModule(filename, `function run(override: boolean) {
      try { return 1; }
      finally { if (override) return 2; cleanup(); }
    }`);
    const graph = module.controlFlowOf(module.walk().functions().single());
    const returns = graph.nodes.filter(node => node.expression.kind === "ReturnStatement");
    const cleanup = graph.nodes.find(node => node.expression.kind === "ExpressionStatement" && node.expression.text?.includes("cleanup()"))!;
    expect(returns).toHaveLength(2);
    expect(graph.exits).toEqual(expect.arrayContaining(returns.map(node => node.id)));
    expect(cleanup.predecessors.length).toBeGreaterThan(0);
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

  it("constructs type-only aliased imports as canonical variables", () => {
    const builder = expressions.module("generated-import.ts");
    const [component] = builder.import(["Component"], "@exact/core", {
      typeOnly: true,
      aliases: { Component: "ExactComponent" }
    });
    expect(component?.name).toBe("ExactComponent");
    expect(component?.importedFrom).toBe("@exact/core");
    expect(component?.typeOnly).toBe(true);
    expect(builder.build().emit().code).toContain('import type { Component as ExactComponent } from "@exact/core";');
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
    expect(multiplyArrow.node.captures.map(variable => variable.name)).toContain("factor");
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
    if (rewritten.state !== "unbound") throw new Error("A text rewrite must require rebinding");
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

  it("rejects overlapping structural edits instead of silently dropping one", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__overlap_rewrite.ts");
    const module = project.updateModule(filename, "const value = 1 + 2;");
    expect(() => rewriteModule(module, rewriter => {
      rewriter.replaceTextWhere(reference => reference.node.kind === "BinaryExpression", () => "3");
      rewriter.replaceTextWhere(reference => reference.node.text === "1", () => "4");
    })).toThrow(/Overlapping expression rewrites/);
  });

  it("requires rebinding between independent span-based rewrite passes", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__sequential_rewrite.ts");
    const module = project.updateModule(filename, "const value = 1;");
    const first = rewriteModule(module, rewriter => rewriter.replaceTextWhere(reference => reference.node.text === "1", () => "2"));
    expect(() => rewriteModule(first, rewriter => rewriter.replaceTextWhere(reference => reference.node.text === "value", () => "other")))
      .toThrow(/Rebind an unbound rewritten module/);
  });

  it("requires complete clone remapping and allocates unique clone identities", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__clone_variables.ts");
    const module = project.updateModule(filename, "const value = 1; void value;");
    const reference = module.walk().references().where(candidate => candidate.name === "value").toArray().at(-1)!;
    expect(() => cloneWithVariables(reference.node, new Map())).toThrow(/explicit mapping for value/);
    const variables = new Map([[reference.variable!, reference.variable!]]);
    expect(cloneWithVariables(reference.node, variables).id).not.toBe(cloneWithVariables(reference.node, variables).id);
  });

  it("resets loop legality when validating a nested function", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__nested_control_validation.ts");
    const module = project.updateModule(filename, "while (true) { function nested() { break; continue; } }");
    expect(validateExpressionTree(module.rootNode, filename).map(diagnostic => diagnostic.code)).toEqual(expect.arrayContaining([
      "EXPR_BREAK_OUTSIDE_CONTROL", "EXPR_CONTINUE_OUTSIDE_LOOP"
    ]));
  });

  it("maps parsed, generated, and rebound lines back to immutable original source", async () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__source_map.ts");
    const source = "const first = 1;\nconst second = 2;";
    const module = project.updateModule(filename, source);
    expect(module.emit({ sourceMap: true }).map?.mappings).toBe("AAAA;AACA");
    const second = module.root.children().toArray()[1]!;
    const rewritten = rewriteModule(module, rewriter => rewriter.insertTextBefore(second, "// generated"));
    const emitted = rewritten.emit({ sourceMap: true });
    expect(emitted.code).toBe("const first = 1;\n// generated\nconst second = 2;");
    expect(emitted.map?.sourcesContent).toEqual([source]);
    expect(emitted.map?.mappings).toBe("AAAA;AACA;AAAA");
    if (rewritten.state !== "unbound") throw new Error("An insertion must require rebinding");
    const rebound = await project.bind(rewritten);
    expect(rebound.emit({ sourceMap: true }).map).toEqual(emitted.map);
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
    expect(secondVariable.symbol).toBe(firstVariable.symbol);
  });

  it("retains bound identity for rewrites that make no changes", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__noop_rewrite.ts");
    const module = project.updateModule(filename, "export const value = 1;");
    const effects = module.effects();
    const rewritten = rewriteModule(module, () => {});
    expect(rewritten).toBe(module);
    expect(rewritten.state).toBe("bound");
    expect(rewritten.effects()).toBe(effects);
  });

  it("reuses analyses for structurally shared unchanged subtrees", () => {
    const project = createExpressionProject({ tsconfigPath: kanbanConfig });
    const filename = path.join(root, "apps/kanban/src/__shared_analysis.ts");
    const module = project.updateModule(filename, "const outer = 1; function first() { return () => outer; } function second() { return 2; }");
    const first = module.walk().functions().where(reference => reference.node.name === "first").single();
    const effects = module.effectsOf(first);
    const captures = module.capturesOf(first.descendants().functions().single());
    const rewritten = rewriteModule(module, rewriter => rewriter.replaceTextWhere(reference => reference.node.text === "2", () => "3"));
    const sharedFirst = rewritten.ref(first.node);
    expect(rewritten.effectsOf(sharedFirst)).toBe(effects);
    expect(rewritten.capturesOf(sharedFirst.descendants().functions().single())).toBe(captures);
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

  it("assigns collision-free identities to same-named sibling block bindings", () => {
    const project = createExpressionProject({ tsconfigPath: path.join(root, "apps/kanban/tsconfig.json") });
    const filename = path.join(root, "apps/kanban/src/__expressions_block_ids.ts");
    const module = project.updateModule(filename, `function view(flag: boolean) { if (flag) { const value = 1; void value; } else { const value = 2; void value; } }`);
    const values = module.walk().references().where(reference => reference.name === "value").toArray();
    expect(new Set(values.map(reference => reference.variable?.id)).size).toBe(2);
    const firstId = values[0]?.variable?.id;
    const updated = project.updateModule(filename, `function view(flag: boolean) { if (flag) { const value = 100; void value; } else { const value = 2; void value; } }`);
    expect(updated.walk().references().where(reference => reference.name === "value").first()?.variable?.id).toBe(firstId);
  });

  it("does not transfer identities between ambiguous repeated control scopes", () => {
    const project = createExpressionProject({ tsconfigPath: path.join(root, "apps/kanban/tsconfig.json") });
    const filename = path.join(root, "apps/kanban/src/__expressions_ambiguous_block_ids.ts");
    const first = project.updateModule(filename, `function view(a: boolean, b: boolean) {
      if (a) { const value = 1; void value; }
      if (b) { const value = 2; void value; }
    }`);
    const oldIds = new Set(first.walk().references().where(reference => reference.name === "value")
      .toArray().map(reference => reference.variable!.id));
    expect(oldIds.size).toBe(2);

    const updated = project.updateModule(filename, `function view(a: boolean, b: boolean) {
      if (a) { const value = 0; void value; }
      if (a) { const value = 1; void value; }
      if (b) { const value = 2; void value; }
    }`);
    const newIds = new Set(updated.walk().references().where(reference => reference.name === "value")
      .toArray().map(reference => reference.variable!.id));
    expect(newIds.size).toBe(3);
    expect([...newIds].some(id => oldIds.has(id))).toBe(false);
  });
});
