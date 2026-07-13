import type { ExpressionNode, Variable } from "./model.js";
import { createModule, type ExpressionModule, type UnboundModule } from "./module.js";
import type { NodeRef } from "./query.js";
import { printNode } from "./builder.js";
import { validateExpressionTree } from "./validation.js";

type Replacement = ExpressionNode | null;
type RewriteSelector = (ref: NodeRef) => boolean;
type RewriteFactory = (ref: NodeRef) => Replacement;

/** Collects immutable tree edits and applies them in one structural-sharing pass. */
export class ModuleRewriter {
  private readonly replacements: Array<Readonly<{ select: RewriteSelector; replace: RewriteFactory }>> = [];
  private readonly before = new Map<ExpressionNode, ExpressionNode[]>();
  private readonly after = new Map<ExpressionNode, ExpressionNode[]>();

  replaceWhere(select: RewriteSelector, replace: RewriteFactory): this {
    this.replacements.push(Object.freeze({ select, replace }));
    return this;
  }

  removeWhere(select: RewriteSelector): this {
    return this.replaceWhere(select, () => null);
  }

  insertBefore(target: ExpressionNode | NodeRef, node: ExpressionNode): this {
    const key = "node" in target ? target.node : target;
    this.before.set(key, [...(this.before.get(key) ?? []), node]);
    return this;
  }

  insertAfter(target: ExpressionNode | NodeRef, node: ExpressionNode): this {
    const key = "node" in target ? target.node : target;
    this.after.set(key, [...(this.after.get(key) ?? []), node]);
    return this;
  }

  apply(module: ExpressionModule): UnboundModule {
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const rewrite = (node: ExpressionNode): ExpressionNode | null => {
      const ref = module.ref(node);
      for (const operation of this.replacements) {
        if (!operation.select(ref)) continue;
        const replacement = operation.replace(ref);
        if (node.span) edits.push({ start: node.span.start, end: node.span.end, text: replacement ? printNode(replacement) : "" });
        return replacement;
      }
      let changed = false;
      const children: ExpressionNode[] = [];
      for (const child of node.children) {
        const prefix = this.before.get(child);
        if (prefix) {
          children.push(...prefix);
          changed = true;
          if (child.span) edits.push({ start: child.span.start, end: child.span.start, text: prefix.map(printNode).join("\n") });
        }
        const next = rewrite(child);
        if (next) children.push(next);
        if (next !== child) changed = true;
        const suffix = this.after.get(child);
        if (suffix) {
          children.push(...suffix);
          changed = true;
          if (child.span) edits.push({ start: child.span.end, end: child.span.end, text: suffix.map(printNode).join("\n") });
        }
      }
      if (!changed) return node;
      return Object.freeze({ ...node, children: Object.freeze(children), synthetic: node.synthetic || !node.span });
    };
    const root = rewrite(module.rootNode);
    if (!root) throw new Error("An expression module root cannot be removed");
    const source = applyEdits(module.source, edits);
    return createModule({ filename: module.filename, source, root, state: "unbound", trivia: module.trivia, diagnostics: validateExpressionTree(root, module.filename) });
  }
}

function applyEdits(source: string, edits: readonly { start: number; end: number; text: string }[]): string {
  let output = source;
  const ordered = [...edits].sort((left, right) => right.start - left.start || right.end - left.end);
  let boundary = source.length + 1;
  for (const edit of ordered) {
    if (edit.end > boundary) continue;
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    boundary = edit.start;
  }
  return output;
}

export function rewriteModule(module: ExpressionModule, configure: (rewriter: ModuleRewriter) => void): UnboundModule {
  const rewriter = new ModuleRewriter();
  configure(rewriter);
  return rewriter.apply(module);
}

export function cloneWithVariables(
  node: ExpressionNode,
  variables: ReadonlyMap<Variable, Variable>
): ExpressionNode {
  const children = node.children.map(child => cloneWithVariables(child, variables));
  return Object.freeze({
    ...node,
    id: `${node.id}:clone`,
    children: Object.freeze(children),
    synthetic: true,
    span: undefined,
    variable: node.variable ? variables.get(node.variable) ?? node.variable : undefined
  });
}
