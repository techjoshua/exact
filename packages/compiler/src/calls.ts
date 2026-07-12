import ts from "typescript";

export function isThisMethodCall(node: ts.CallExpression, methodName: string): boolean {
  return isThisMethodAccess(node.expression, methodName);
}

export function isThisTaskCall(node: ts.CallExpression): boolean {
  return isThisMethodCall(node, "task") || taskRequestedPlacement(node) !== undefined;
}

export function taskRequestedPlacement(node: ts.CallExpression): "server" | "client" | undefined {
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
  const placement = node.expression.name.text;
  if (placement !== "server" && placement !== "client") return undefined;
  const taskAccess = node.expression.expression;
  return isThisMethodAccess(taskAccess, "task") ? placement : undefined;
}

export function isThisMethodAccess(expression: ts.Expression, methodName: string): boolean {
  return ts.isPropertyAccessExpression(expression)
    && expression.name.text === methodName
    && expression.expression.kind === ts.SyntaxKind.ThisKeyword;
}

export function isFunctionLikeExpression(node: ts.Expression): node is ts.ArrowFunction | ts.FunctionExpression {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}
