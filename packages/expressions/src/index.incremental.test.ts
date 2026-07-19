import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  cloneWithVariables,
  expressions,
  lowerModuleText,
  rewriteModule,
  validateExpressionTree
} from "./index.js";
import { createExpressionProject } from "./test-support/project.js";

const root = path.resolve(import.meta.dirname, "../../..");
const kanbanConfig = path.join(root, "apps/kanban/tsconfig.json");

describe("@exact/expressions: incremental", () => {
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
