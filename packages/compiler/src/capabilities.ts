import ts from 'typescript';
import type { ExactRawHtmlCapabilityIR, TransformTarget } from './types.js';

/** Finds calls to unsafeHtml imported from @exactjs/core and records no runtime values. */
export function collectRawHtmlCapabilities(
	sourceFile: ts.SourceFile,
	filename: string,
	target: TransformTarget
): ExactRawHtmlCapabilityIR[] {
	const direct = new Set<string>();
	const namespaces = new Set<string>();

	for (const statement of sourceFile.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!ts.isStringLiteral(statement.moduleSpecifier) ||
			statement.moduleSpecifier.text !== '@exactjs/core' ||
			!statement.importClause
		)
			continue;
		const bindings = statement.importClause.namedBindings;
		if (bindings && ts.isNamedImports(bindings)) {
			for (const element of bindings.elements) {
				if ((element.propertyName ?? element.name).text === 'unsafeHtml')
					direct.add(element.name.text);
			}
		} else if (bindings && ts.isNamespaceImport(bindings)) {
			namespaces.add(bindings.name.text);
		}
	}

	const requirements: ExactRawHtmlCapabilityIR[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && isUnsafeHtmlTarget(node.expression, direct, namespaces)) {
			const position = sourceFile.getLineAndCharacterOfPosition(
				node.expression.getStart(sourceFile)
			);
			requirements.push({
				source: filename,
				line: position.line + 1,
				column: position.character + 1,
				symbol: enclosingSymbol(node),
				targets: target === 'default' ? ['client', 'server'] : [target]
			});
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return requirements;
}

function isUnsafeHtmlTarget(
	expression: ts.Expression,
	direct: ReadonlySet<string>,
	namespaces: ReadonlySet<string>
): boolean {
	if (ts.isIdentifier(expression)) return direct.has(expression.text);
	return (
		ts.isPropertyAccessExpression(expression) &&
		expression.name.text === 'unsafeHtml' &&
		ts.isIdentifier(expression.expression) &&
		namespaces.has(expression.expression.text)
	);
}

function enclosingSymbol(node: ts.Node): string {
	for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
		if (
			(ts.isFunctionDeclaration(current) ||
				ts.isClassDeclaration(current) ||
				ts.isMethodDeclaration(current)) &&
			current.name &&
			ts.isIdentifier(current.name)
		)
			return current.name.text;
		if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name))
			return current.name.text;
	}
	return '<module>';
}
