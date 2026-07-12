import ts from "typescript";

export function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? Boolean(ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
    : false;
}

export function hasDefaultModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? Boolean(ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword))
    : false;
}

export function nodeNameText(node: ts.Node): string | undefined {
  return hasIdentifierName(node) ? node.name.text : undefined;
}

export function hasIdentifierName(node: ts.Node): node is ts.Node & { name: ts.Identifier } {
  const name = (node as { name?: ts.Node }).name;
  return !!name && ts.isIdentifier(name);
}

export function isIdentifierDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return !!parent && (
    (ts.isVariableDeclaration(parent) && parent.name === node)
    || (ts.isParameter(parent) && parent.name === node)
    || (ts.isFunctionDeclaration(parent) && parent.name === node)
    || (ts.isTypeAliasDeclaration(parent) && parent.name === node)
    || (ts.isInterfaceDeclaration(parent) && parent.name === node)
    || (ts.isBindingElement(parent) && parent.name === node)
  );
}

export function isPropertyAccessName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return !!parent && ts.isPropertyAccessExpression(parent) && parent.name === node;
}
