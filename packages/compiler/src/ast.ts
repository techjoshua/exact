import ts from 'typescript';

/** Returns whether a node has an export modifier. */
export function hasExportModifier(node: ts.Node): boolean {
	return ts.canHaveModifiers(node)
		? Boolean(
				ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
			)
		: false;
}

/** Returns whether a node has a default modifier. */
export function hasDefaultModifier(node: ts.Node): boolean {
	return ts.canHaveModifiers(node)
		? Boolean(
				ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
			)
		: false;
}

/** Returns the identifier text for a named node, when the name is an identifier. */
export function nodeNameText(node: ts.Node): string | undefined {
	return hasIdentifierName(node) ? node.name.text : undefined;
}

/** Narrows a node to one with an identifier name. */
export function hasIdentifierName(node: ts.Node): node is ts.Node & { name: ts.Identifier } {
	const name = (node as { name?: ts.Node }).name;
	return !!name && ts.isIdentifier(name);
}

/** Returns whether an identifier is the declaration name for its parent node. */
export function isIdentifierDeclarationName(node: ts.Identifier): boolean {
	const parent = node.parent;
	return (
		!!parent &&
		((ts.isVariableDeclaration(parent) && parent.name === node) ||
			(ts.isParameter(parent) && parent.name === node) ||
			(ts.isFunctionDeclaration(parent) && parent.name === node) ||
			(ts.isTypeAliasDeclaration(parent) && parent.name === node) ||
			(ts.isInterfaceDeclaration(parent) && parent.name === node) ||
			(ts.isBindingElement(parent) && parent.name === node))
	);
}

/** Returns whether an identifier is the property name in a property access expression. */
export function isPropertyAccessName(node: ts.Identifier): boolean {
	const parent = node.parent;
	return !!parent && ts.isPropertyAccessExpression(parent) && parent.name === node;
}
