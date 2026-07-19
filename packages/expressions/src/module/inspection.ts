import ts from 'typescript';

export function isModuleCall(
	node: ts.Node
): node is ts.CallExpression & { arguments: [ts.StringLiteral, ...ts.Expression[]] } {
	return (
		ts.isCallExpression(node) &&
		node.arguments.length > 0 &&
		ts.isStringLiteral(node.arguments[0]) &&
		(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
			(ts.isIdentifier(node.expression) && node.expression.text === 'require'))
	);
}

export function isRequireCall(
	node: ts.Node
): node is ts.CallExpression & { arguments: [ts.StringLiteral] } {
	return (
		ts.isCallExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === 'require' &&
		node.arguments.length === 1 &&
		ts.isStringLiteral(node.arguments[0])
	);
}
