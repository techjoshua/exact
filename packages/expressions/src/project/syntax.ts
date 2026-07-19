import path from 'node:path';
import ts from 'typescript';
import type {
	ExpressionDiagnostic,
	ExpressionTypeKind,
	NodeCategory,
	ScopeKind,
	SourceSpan
} from '../model.js';

/** Transforms file into its required representation. */
export function normalizeFile(filename: string): string {
	const normalized = displayFile(filename);
	return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
}

/** Performs the display file domain operation. */
export function displayFile(filename: string): string {
	return path.resolve(filename).replace(/\\/g, '/');
}

/** Performs the script kind domain operation. */
export function scriptKind(filename: string): ts.ScriptKind {
	if (filename.endsWith('.tsx')) return ts.ScriptKind.TSX;
	if (filename.endsWith('.jsx')) return ts.ScriptKind.JSX;
	if (/\.[cm]?js$/.test(filename)) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}

/** Reports whether scope node. */
export function isScopeNode(node: ts.Node): boolean {
	return (
		ts.isSourceFile(node) ||
		ts.isFunctionLike(node) ||
		ts.isClassLike(node) ||
		ts.isBlock(node) ||
		ts.isModuleBlock(node) ||
		ts.isCaseBlock(node) ||
		ts.isCatchClause(node)
	);
}

/** Performs the scope kind domain operation. */
export function scopeKind(node: ts.Node): ScopeKind {
	if (ts.isSourceFile(node) || ts.isModuleBlock(node)) return 'module';
	if (ts.isFunctionLike(node)) return 'function';
	if (ts.isClassLike(node)) return 'class';
	if (ts.isCatchClause(node)) return 'catch';
	return 'block';
}

/** Performs the category domain operation. */
export function category(node: ts.Node): NodeCategory {
	if (ts.isSourceFile(node)) return 'module';
	if (isJsxNode(node)) return 'jsx';
	if (ts.isTypeNode(node)) return 'type';
	if (isDeclarationNode(node)) return 'declaration';
	if (
		ts.isObjectBindingPattern(node) ||
		ts.isArrayBindingPattern(node) ||
		ts.isBindingElement(node)
	)
		return 'pattern';
	if (ts.isStatement(node)) return 'statement';
	if (ts.isExpression(node)) return 'expression';
	return 'token';
}

function isJsxNode(node: ts.Node): boolean {
	return (
		ts.isJsxElement(node) ||
		ts.isJsxSelfClosingElement(node) ||
		ts.isJsxFragment(node) ||
		ts.isJsxExpression(node) ||
		ts.isJsxAttribute(node) ||
		ts.isJsxAttributes(node) ||
		ts.isJsxOpeningElement(node) ||
		ts.isJsxClosingElement(node) ||
		ts.isJsxOpeningFragment(node) ||
		ts.isJsxClosingFragment(node) ||
		ts.isJsxSpreadAttribute(node) ||
		ts.isJsxText(node)
	);
}

/** Performs the node name domain operation. */
export function nodeName(node: ts.Node): string | undefined {
	if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isJsxText(node)) return node.text;
	if (
		ts.isPropertyAccessExpression(node) ||
		ts.isPropertyAssignment(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isPropertyDeclaration(node)
	)
		return node.name.getText();
	if (
		ts.isElementAccessExpression(node) &&
		(ts.isStringLiteralLike(node.argumentExpression) ||
			ts.isNumericLiteral(node.argumentExpression))
	)
		return node.argumentExpression.text;
	if (
		ts.isJsxOpeningElement(node) ||
		ts.isJsxSelfClosingElement(node) ||
		ts.isJsxClosingElement(node)
	)
		return node.tagName.getText();
	if (hasNodeName(node) && node.name) return node.name.getText();
	return undefined;
}

function isDeclarationNode(node: ts.Node): boolean {
	return (
		ts.isVariableDeclaration(node) ||
		ts.isFunctionDeclaration(node) ||
		ts.isClassDeclaration(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isPropertyDeclaration(node) ||
		ts.isParameter(node) ||
		ts.isImportDeclaration(node) ||
		ts.isImportSpecifier(node) ||
		ts.isNamespaceImport(node) ||
		ts.isExportDeclaration(node) ||
		ts.isEnumDeclaration(node) ||
		ts.isModuleDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node) ||
		ts.isTypeAliasDeclaration(node) ||
		ts.isInterfaceDeclaration(node) ||
		ts.isTypeParameterDeclaration(node)
	);
}

/** Reports whether node name. */
export function hasNodeName(node: ts.Node): node is ts.Node & { name: ts.DeclarationName } {
	return 'name' in node;
}

/** Performs the node operator domain operation. */
export function nodeOperator(node: ts.Node): string | undefined {
	if (ts.isBinaryExpression(node)) return node.operatorToken.getText();
	if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
		return ts.tokenToString(node.operator);
	return undefined;
}

/** Collects binding identifiers in deterministic order. */
export function collectBindingIdentifiers(name: ts.BindingName): ts.Identifier[] {
	if (ts.isIdentifier(name)) return [name];
	return name.elements.flatMap((element) =>
		ts.isOmittedExpression(element) ? [] : collectBindingIdentifiers(element.name)
	);
}

/** Performs the declaration binding name domain operation. */
export function declarationBindingName(node: ts.Node): string | undefined {
	if (ts.isIdentifier(node)) return node.text;
	if (hasNodeName(node) && node.name && ts.isIdentifier(node.name)) return node.name.text;
	return undefined;
}

/** Reports whether mutable binding. */
export function isMutableBinding(node: ts.Node): boolean {
	if (ts.isParameter(node)) return node.name.getText() !== 'this';
	if (ts.isBindingElement(node)) return isMutableBinding(node.parent.parent);
	if (ts.isVariableDeclaration(node)) {
		const declarations = node.parent;
		return (
			ts.isVariableDeclarationList(declarations) && (declarations.flags & ts.NodeFlags.Const) === 0
		);
	}
	return false;
}

/** Performs the import source domain operation. */
export function importSource(node: ts.Node): string | undefined {
	let cursor: ts.Node | undefined = node;
	while (cursor && !ts.isImportDeclaration(cursor)) cursor = cursor.parent;
	return cursor && ts.isStringLiteral(cursor.moduleSpecifier)
		? cursor.moduleSpecifier.text
		: undefined;
}

/** Reports whether type only binding. */
export function isTypeOnlyBinding(node: ts.Node): boolean {
	let cursor: ts.Node | undefined = node;
	while (cursor && !ts.isImportDeclaration(cursor)) {
		if (ts.isImportSpecifier(cursor) && cursor.isTypeOnly) return true;
		cursor = cursor.parent;
	}
	return !!cursor?.importClause?.isTypeOnly;
}

/** Performs the type kind domain operation. */
export function typeKind(type: ts.Type): ExpressionTypeKind {
	const flags = type.flags;
	if (flags & ts.TypeFlags.Any) return 'any';
	if (flags & ts.TypeFlags.Unknown) return 'unknown';
	if (flags & ts.TypeFlags.Never) return 'never';
	if (flags & ts.TypeFlags.Void) return 'void';
	if (flags & ts.TypeFlags.Undefined) return 'undefined';
	if (flags & ts.TypeFlags.Null) return 'null';
	if (flags & ts.TypeFlags.BooleanLike) return 'boolean';
	if (flags & ts.TypeFlags.NumberLike) return 'number';
	if (flags & ts.TypeFlags.BigIntLike) return 'bigint';
	if (flags & ts.TypeFlags.StringLike) return 'string';
	if (flags & ts.TypeFlags.ESSymbolLike) return 'symbol';
	if (flags & ts.TypeFlags.Union) return 'union';
	if (flags & ts.TypeFlags.Intersection) return 'intersection';
	if (flags & ts.TypeFlags.TypeParameter) return 'type-parameter';
	return type.getCallSignatures().length ? 'function' : 'object';
}

/** Performs the diagnostic from ts domain operation. */
export function diagnosticFromTs(diagnostic: ts.Diagnostic): ExpressionDiagnostic {
	const source = diagnostic.file;
	const start = diagnostic.start;
	let span: SourceSpan | undefined;
	if (source && start !== undefined) {
		const line = source.getLineAndCharacterOfPosition(start);
		span = Object.freeze({
			start,
			end: start + (diagnostic.length ?? 0),
			line: line.line + 1,
			column: line.character + 1
		});
	}
	return Object.freeze({
		code: `TS${diagnostic.code}`,
		message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
		severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
		...(source ? { filename: normalizeFile(source.fileName) } : {}),
		...(span ? { span } : {})
	});
}
