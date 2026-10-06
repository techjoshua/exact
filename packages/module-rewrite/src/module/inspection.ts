import ts from 'typescript';

/** Recognizes literal native import and CommonJS requests by lexical loader identity. */
export function isModuleCall(
	node: ts.Node,
	checker: ts.TypeChecker
): node is ts.CallExpression & { arguments: [ts.StringLiteralLike, ...ts.Expression[]] } {
	return (
		ts.isCallExpression(node) &&
		node.arguments.length > 0 &&
		ts.isStringLiteralLike(node.arguments[0]) &&
		(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
			nativeModuleLoader(node.expression, checker))
	);
}

/** Recognizes a single literal CommonJS request from a native or ambient loader. */
export function isRequireCall(
	node: ts.Node,
	checker: ts.TypeChecker
): node is ts.CallExpression & { arguments: [ts.StringLiteralLike] } {
	return (
		ts.isCallExpression(node) &&
		nativeModuleLoader(node.expression, checker) &&
		node.arguments.length === 1 &&
		ts.isStringLiteralLike(node.arguments[0])
	);
}

/** Distinguishes native or ambient require bindings from authored callbacks and imported values. */
function nativeModuleLoader(expression: ts.Expression, checker: ts.TypeChecker): boolean {
	if (!ts.isIdentifier(expression) || expression.text !== 'require') return false;
	const symbol = checker.getSymbolAtLocation(expression);
	if (!symbol) return true;
	return (symbol.declarations ?? []).every((declaration) => {
		if (declaration.getSourceFile().isDeclarationFile) return true;
		for (let current: ts.Node | undefined = declaration; current; current = current.parent) {
			if (
				ts.canHaveModifiers(current) &&
				ts.getModifiers(current)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)
			)
				return true;
		}
		return false;
	});
}
