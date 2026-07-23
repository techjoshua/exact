import type { BoundModule, ExpressionScope, NodeRef } from '@exactjs/expressions';
import { browserPlatformGlobals } from './platform-effects.js';
import type {
	ExactSemanticDeclarationIR,
	ExactSemanticExportIR,
	ExactSemanticGraphIR,
	ExactSemanticReferenceIR,
	ExactSemanticScopeIR
} from './types.js';

/** Provides the canonical browser globals value. */
export const browserGlobals = browserPlatformGlobals;

/** Builds compiler semantic IR solely from canonical expression bindings. */
export function buildExpressionSemanticGraph(module: BoundModule): ExactSemanticGraphIR {
	const scopeNodes = new Map<string, NodeRef>();
	const expressionScopes = new Map<string, ExpressionScope>();
	for (const reference of module.walk()) {
		let scope: ExpressionScope | undefined = reference.node.scope;
		while (scope) {
			expressionScopes.set(scope.id, scope);
			if (!scopeNodes.has(scope.id)) scopeNodes.set(scope.id, reference);
			scope = scope.parent;
		}
	}
	const scopes = [...expressionScopes.values()].map(
		(scope) =>
			({
				id: scope.id,
				...(scope.parent ? { parentId: scope.parent.id } : {}),
				kind: semanticScopeKind(scope.kind),
				nodeKind: scopeNodes.get(scope.id)?.node.kind ?? 'Unknown'
			}) satisfies ExactSemanticScopeIR
	);

	const declarations: ExactSemanticDeclarationIR[] = [];
	const declarationByVariable = new Map<string, ExactSemanticDeclarationIR>();
	for (const reference of module
		.walk()
		.where((candidate) => candidate.node.kind === 'Identifier')) {
		const variable = reference.variable;
		if (!variable || declarationByVariable.has(variable.id) || !isDeclarationReference(reference))
			continue;
		const kind = semanticDeclarationKind(variable.declarationKind);
		if (!kind || !reference.node.span) continue;
		const declaration: ExactSemanticDeclarationIR = {
			id: variable.id,
			name: variable.name,
			scopeId: variable.scope.id,
			kind,
			nodeStart: reference.node.span.start,
			nodeEnd: reference.node.span.end,
			...(variable.importedFrom
				? { moduleSpecifier: variable.importedFrom, importedName: importedName(reference) }
				: {}),
			...(variable.typeOnly || isTypeOnly(reference) ? { typeOnly: true } : {}),
			...(exportedName(reference) ? { exportedName: exportedName(reference) } : {})
		};
		declarations.push(declaration);
		declarationByVariable.set(variable.id, declaration);
	}

	const references: ExactSemanticReferenceIR[] = [];
	for (const reference of module
		.walk()
		.where((candidate) => candidate.node.kind === 'Identifier')) {
		if (!reference.node.span || isDeclarationReference(reference) || isNonReference(reference))
			continue;
		const variable = reference.variable;
		const declaration = variable ? declarationByVariable.get(variable.id) : undefined;
		const source = variable?.importedFrom
			? 'import'
			: declaration
				? 'local'
				: browserGlobals.has(reference.name ?? '')
					? 'global'
					: 'unresolved';
		references.push({
			name: reference.name!,
			scopeId: reference.node.scope.id,
			source,
			nodeStart: reference.node.span.start,
			nodeEnd: reference.node.span.end,
			...(declaration ? { declarationId: declaration.id, declarationKind: declaration.kind } : {}),
			...(variable?.importedFrom
				? {
						moduleSpecifier: variable.importedFrom,
						importedName: declaration?.importedName ?? variable.name
					}
				: {}),
			...(variable?.typeOnly || isTypeOnly(reference) || declaration?.typeOnly
				? { typeOnly: true }
				: {}),
			...(exportSpecifierName(reference) ? { exportedName: exportSpecifierName(reference) } : {})
		});
	}

	const exports: ExactSemanticExportIR[] = [];
	for (const declaration of declarations) {
		if (declaration.exportedName)
			exports.push({
				exportedName: declaration.exportedName,
				localName: declaration.name,
				...(declaration.typeOnly ? { typeOnly: true } : {})
			});
	}
	for (const specifier of module.walk().ofKind('ExportSpecifier')) {
		const identifiers = specifier
			.children()
			.where((child) => child.node.kind === 'Identifier')
			.toArray();
		const exported = identifiers.at(-1)?.name;
		const local = identifiers.at(-2)?.name ?? exported;
		if (!exported) continue;
		const declaration = identifiers.at(-2)?.variable
			? declarationByVariable.get(identifiers.at(-2)!.variable!.id)
			: undefined;
		const exportDeclaration = specifier
			.ancestors()
			.first((ancestor) => ancestor.node.kind === 'ExportDeclaration');
		const moduleSpecifier = exportDeclaration?.node.text?.match(/\bfrom\s*["']([^"']+)["']/)?.[1];
		exports.push({
			exportedName: exported,
			...(moduleSpecifier
				? { importedName: local, moduleSpecifier }
				: local
					? { localName: local }
					: {}),
			...(declaration?.typeOnly || /\btype\b/.test(specifier.node.text ?? '')
				? { typeOnly: true }
				: {})
		});
	}

	return {
		scopes: scopes.sort((left, right) => left.id.localeCompare(right.id)),
		declarations: declarations.sort(
			(left, right) => left.nodeStart - right.nodeStart || left.name.localeCompare(right.name)
		),
		references: references.sort(
			(left, right) => left.nodeStart - right.nodeStart || left.name.localeCompare(right.name)
		),
		exports: dedupeExports(exports).sort((left, right) =>
			left.exportedName.localeCompare(right.exportedName)
		)
	};
}

function semanticScopeKind(kind: ExpressionScope['kind']): ExactSemanticScopeIR['kind'] {
	if (kind === 'module') return 'module';
	if (kind === 'function') return 'function';
	return 'block';
}

function semanticDeclarationKind(kind: string): ExactSemanticDeclarationIR['kind'] | undefined {
	if (kind === 'ImportSpecifier' || kind === 'ImportClause' || kind === 'NamespaceImport')
		return 'import';
	if (kind === 'FunctionDeclaration' || kind === 'FunctionExpression') return 'function';
	if (kind === 'ClassDeclaration' || kind === 'ClassExpression') return 'class';
	if (kind === 'VariableDeclaration' || kind === 'BindingElement') return 'variable';
	if (kind === 'Parameter') return 'parameter';
	if (kind === 'TypeAliasDeclaration' || kind === 'TypeParameter') return 'type';
	if (kind === 'InterfaceDeclaration') return 'interface';
	return undefined;
}

function isDeclarationReference(reference: NodeRef): boolean {
	const parent = reference.parent;
	if (!parent) return false;
	if (
		[
			'VariableDeclaration',
			'Parameter',
			'FunctionDeclaration',
			'FunctionExpression',
			'ClassDeclaration',
			'ClassExpression',
			'ImportSpecifier',
			'ImportClause',
			'NamespaceImport',
			'BindingElement',
			'TypeAliasDeclaration',
			'TypeParameter',
			'InterfaceDeclaration'
		].includes(parent.node.kind)
	) {
		const identifiers = parent.node.children.filter((child) => child.kind === 'Identifier');
		if (parent.node.kind === 'ImportSpecifier' || parent.node.kind === 'BindingElement')
			return identifiers.at(-1) === reference.node;
		if (parent.node.kind === 'VariableDeclaration' || parent.node.kind === 'Parameter')
			return parent.node.children[0] === reference.node;
		return identifiers[0] === reference.node;
	}
	return false;
}

function isNonReference(reference: NodeRef): boolean {
	const parent = reference.parent;
	if (!parent) return false;
	if (parent.node.kind === 'ImportSpecifier' || parent.node.kind === 'BindingElement') {
		const identifiers = parent
			.children()
			.where((child) => child.node.kind === 'Identifier')
			.toArray();
		return identifiers.length > 1 && identifiers.at(-1)?.node !== reference.node;
	}
	if (parent.node.kind === 'ExportSpecifier') {
		if (
			parent
				.ancestors()
				.first((ancestor) => ancestor.node.kind === 'ExportDeclaration')
				?.node.text?.match(/\bfrom\s*["']/)
		)
			return true;
		const identifiers = parent
			.children()
			.where((child) => child.node.kind === 'Identifier')
			.toArray();
		return identifiers.length > 1 && identifiers.at(-1)?.node === reference.node;
	}
	if (
		parent.node.kind === 'PropertyAccessExpression' &&
		parent.node.children.at(-1) === reference.node
	)
		return true;
	if (
		[
			'PropertyAssignment',
			'PropertyDeclaration',
			'MethodDeclaration',
			'PropertySignature',
			'MethodSignature'
		].includes(parent.node.kind) &&
		parent.node.children.find((child) => child.kind === 'Identifier') === reference.node
	)
		return true;
	if (parent.node.kind === 'JsxAttribute') return true;
	return (
		['JsxOpeningElement', 'JsxClosingElement', 'JsxSelfClosingElement'].includes(
			parent.node.kind
		) && /^[a-z]/.test(reference.name ?? '')
	);
}

function isTypeOnly(reference: NodeRef): boolean {
	if (
		reference.node.category === 'type' ||
		reference.ancestors().any((ancestor) => ancestor.node.category === 'type')
	)
		return true;
	const importDeclaration = reference
		.ancestors()
		.first((ancestor) => ancestor.node.kind === 'ImportDeclaration');
	return !!importDeclaration && /\bimport\s+type\b/.test(importDeclaration.node.text ?? '');
}

function importedName(reference: NodeRef): string {
	const parent = reference.parent;
	if (parent?.node.kind === 'ImportClause') return 'default';
	if (parent?.node.kind === 'NamespaceImport') return '*';
	if (parent?.node.kind === 'ImportSpecifier') {
		const identifiers = parent
			.children()
			.where((child) => child.node.kind === 'Identifier')
			.toArray();
		return identifiers.length > 1 ? identifiers[0]!.name! : reference.name!;
	}
	return reference.name!;
}

function exportedName(reference: NodeRef): string | undefined {
	const declaration =
		reference.parent?.node.kind === 'VariableDeclaration'
			? reference
					.ancestors()
					.first(
						(ancestor) =>
							ancestor.node.kind === 'VariableStatement' || ancestor.node.kind === 'FirstStatement'
					)
			: reference.parent;
	if (!declaration || !/^export\b/.test(declaration.node.text?.trimStart() ?? '')) return undefined;
	return /\bdefault\b/.test(declaration.node.text ?? '') ? 'default' : reference.name;
}

function exportSpecifierName(reference: NodeRef): string | undefined {
	const parent = reference.parent;
	if (parent?.node.kind !== 'ExportSpecifier') return undefined;
	const identifiers = parent
		.children()
		.where((child) => child.node.kind === 'Identifier')
		.toArray();
	if (identifiers.length === 1 && identifiers[0]?.node === reference.node) return reference.name;
	return identifiers[0]?.node === reference.node ? identifiers.at(-1)?.name : undefined;
}

function dedupeExports(values: readonly ExactSemanticExportIR[]): ExactSemanticExportIR[] {
	const result = new Map<string, ExactSemanticExportIR>();
	for (const value of values)
		result.set(
			`${value.exportedName}:${value.localName ?? ''}:${value.moduleSpecifier ?? ''}`,
			value
		);
	return [...result.values()];
}
