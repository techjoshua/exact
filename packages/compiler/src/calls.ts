import ts from 'typescript';

/** Returns whether a call expression invokes this.<methodName>(). */
export function isThisMethodCall(node: ts.CallExpression, methodName: string): boolean {
	return isThisMethodAccess(node.expression, methodName);
}

/** Returns whether a call expression invokes this.task(), this.task.server(), or this.task.client(). */
export function isThisTaskCall(node: ts.CallExpression): boolean {
	return isThisMethodCall(node, 'task') || taskRequestedPlacement(node) !== undefined;
}

/** Returns an explicit task placement requested through this.task.server/client(), if present. */
export function taskRequestedPlacement(node: ts.CallExpression): 'server' | 'client' | undefined {
	if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
	const placement = node.expression.name.text;
	if (placement !== 'server' && placement !== 'client') return undefined;
	const taskAccess = node.expression.expression;
	return isThisMethodAccess(taskAccess, 'task') ? placement : undefined;
}

/** Returns whether an expression is direct access to this.<methodName>. */
export function isThisMethodAccess(expression: ts.Expression, methodName: string): boolean {
	return (
		ts.isPropertyAccessExpression(expression) &&
		expression.name.text === methodName &&
		expression.expression.kind === ts.SyntaxKind.ThisKeyword
	);
}

/** Narrows an expression to an arrow function or function expression. */
export function isFunctionLikeExpression(
	node: ts.Expression
): node is ts.ArrowFunction | ts.FunctionExpression {
	return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}
