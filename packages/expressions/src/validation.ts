import type { ExpressionDiagnostic, ExpressionNode, ExpressionScope } from "./model.js";

/** Performs TypeScript-independent structural validation for synthetic trees and rewrites. */
export function validateExpressionTree(root: ExpressionNode, filename?: string): readonly ExpressionDiagnostic[] {
  const diagnostics: ExpressionDiagnostic[] = [];
  const seen = new Set<ExpressionNode>();

  const report = (node: ExpressionNode, code: string, message: string): void => {
    diagnostics.push(Object.freeze({ code, message, severity: "error" as const, ...(filename ? { filename } : {}), ...(node.span ? { span: node.span } : {}) }));
  };

  const visit = (node: ExpressionNode, context: { functions: number; loops: number; switches: number }, parent?: ExpressionNode): void => {
    if (seen.has(node)) {
      report(node, "EXPR_SHARED_NODE", "The same expression node occurs in more than one tree position; clone it before insertion");
      return;
    }
    seen.add(node);
    if (parent && !scopesRelated(parent.scope, node.scope)) report(node, "EXPR_FOREIGN_SCOPE", "A node from an unrelated lexical scope must be cloned with explicit variable remapping before insertion");
    if (node.kind === "Identifier" && node.synthetic && !node.variable) report(node, "EXPR_UNRESOLVED_VARIABLE", `Synthetic identifier ${node.name ?? "<unnamed>"} has no Variable binding`);
    if (node.variable && !scopeIsVisible(node.scope, node.variable.scope)) report(node, "EXPR_ILLEGAL_CAPTURE", `Variable ${node.variable.name} is not visible from this scope`);
    if (node.kind === "ReturnStatement" && context.functions === 0) report(node, "EXPR_RETURN_OUTSIDE_FUNCTION", "return is only valid inside a function");
    if (node.kind === "BreakStatement" && context.loops === 0 && context.switches === 0) report(node, "EXPR_BREAK_OUTSIDE_CONTROL", "break is only valid inside a loop or switch");
    if (node.kind === "ContinueStatement" && context.loops === 0) report(node, "EXPR_CONTINUE_OUTSIDE_LOOP", "continue is only valid inside a loop");
    if (node.category === "jsx" && (node.kind === "JsxElement" || node.kind === "JsxSelfClosingElement") && !node.name) report(node, "EXPR_JSX_NAME", "JSX elements require a tag name");

    const next = {
      functions: context.functions + (isFunction(node.kind) ? 1 : 0),
      loops: context.loops + (isLoop(node.kind) ? 1 : 0),
      switches: context.switches + (node.kind === "SwitchStatement" ? 1 : 0)
    };
    for (const child of node.children) visit(child, next, node);
  };

  visit(root, { functions: 0, loops: 0, switches: 0 });
  return Object.freeze(diagnostics);
}

function scopesRelated(left: ExpressionScope, right: ExpressionScope): boolean {
  return scopeIsVisible(left, right) || scopeIsVisible(right, left);
}

function scopeIsVisible(use: ExpressionScope, declaration: ExpressionScope): boolean {
  let cursor: ExpressionScope | undefined = use;
  while (cursor) {
    if (cursor === declaration || cursor.id === declaration.id) return true;
    cursor = cursor.parent;
  }
  return false;
}

function isFunction(kind: string): boolean {
  return kind === "FunctionDeclaration" || kind === "FunctionExpression" || kind === "ArrowFunction" || kind === "MethodDeclaration";
}

function isLoop(kind: string): boolean {
  return kind === "ForStatement" || kind === "ForInStatement" || kind === "ForOfStatement" || kind === "WhileStatement" || kind === "DoStatement";
}
