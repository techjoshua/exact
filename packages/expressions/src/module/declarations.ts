import ts from 'typescript';
import type { ModuleExportReplacement } from './contracts.js';

export function rewriteImportDeclaration(
	factory: ts.NodeFactory,
	node: ts.ImportDeclaration,
	replacements: ReadonlyMap<string, ModuleExportReplacement>
): ts.ImportDeclaration | readonly ts.ImportDeclaration[] {
	const clause = node.importClause!;
	if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) return node;
	const retained: ts.ImportSpecifier[] = [];
	const grouped = new Map<
		string,
		{ targetModule: string; specifiers: ts.ImportSpecifier[]; defaultName?: ts.Identifier }
	>();
	let defaultName = clause.name;
	const defaultReplacement = clause.name ? replacements.get('default') : undefined;
	if (defaultReplacement && clause.name) {
		const group = targetGroup(grouped, defaultReplacement.targetModule);
		if (defaultReplacement.targetExport === 'default') group.defaultName = clause.name;
		else
			group.specifiers.push(
				factory.createImportSpecifier(
					false,
					factory.createIdentifier(defaultReplacement.targetExport),
					clause.name
				)
			);
		defaultName = undefined;
	}
	const namedBindings =
		clause.namedBindings && ts.isNamedImports(clause.namedBindings)
			? clause.namedBindings
			: undefined;
	for (const specifier of namedBindings?.elements ?? []) {
		if (specifier.isTypeOnly) {
			retained.push(specifier);
			continue;
		}
		const sourceExport = specifier.propertyName?.text ?? specifier.name.text;
		const replacement = replacements.get(sourceExport);
		if (!replacement) {
			retained.push(specifier);
			continue;
		}
		const group = targetGroup(grouped, replacement.targetModule);
		if (replacement.targetExport === 'default') {
			if (group.defaultName)
				throw new Error(
					`Cannot map multiple imports to the default export of ${replacement.targetModule}`
				);
			group.defaultName = specifier.name;
		} else {
			group.specifiers.push(
				factory.createImportSpecifier(
					false,
					factory.createIdentifier(replacement.targetExport),
					specifier.name
				)
			);
		}
	}
	if (!defaultReplacement && retained.length === (namedBindings?.elements.length ?? 0)) return node;
	const declarations: ts.ImportDeclaration[] = [];
	if (defaultName || retained.length) {
		declarations.push(
			factory.updateImportDeclaration(
				node,
				node.modifiers,
				factory.updateImportClause(
					clause,
					false,
					defaultName,
					retained.length ? factory.createNamedImports(retained) : undefined
				),
				node.moduleSpecifier,
				node.attributes
			)
		);
	}
	for (const group of [...grouped.values()].sort((left, right) =>
		left.targetModule.localeCompare(right.targetModule)
	)) {
		declarations.push(
			factory.createImportDeclaration(
				undefined,
				factory.createImportClause(
					false,
					group.defaultName,
					group.specifiers.length ? factory.createNamedImports(group.specifiers) : undefined
				),
				factory.createStringLiteral(group.targetModule),
				undefined
			)
		);
	}
	return declarations;
}

export function rewriteExportDeclaration(
	factory: ts.NodeFactory,
	node: ts.ExportDeclaration,
	replacements: ReadonlyMap<string, ModuleExportReplacement>
): ts.ExportDeclaration | readonly ts.ExportDeclaration[] {
	const retained: ts.ExportSpecifier[] = [];
	const grouped = new Map<string, ts.ExportSpecifier[]>();
	for (const specifier of (node.exportClause as ts.NamedExports).elements) {
		if (specifier.isTypeOnly) {
			retained.push(specifier);
			continue;
		}
		const sourceExport = specifier.propertyName?.text ?? specifier.name.text;
		const replacement = replacements.get(sourceExport);
		if (!replacement) {
			retained.push(specifier);
			continue;
		}
		const values = grouped.get(replacement.targetModule) ?? [];
		values.push(
			factory.createExportSpecifier(
				false,
				factory.createIdentifier(replacement.targetExport),
				specifier.name
			)
		);
		grouped.set(replacement.targetModule, values);
	}
	if (retained.length === (node.exportClause as ts.NamedExports).elements.length) return node;
	const declarations: ts.ExportDeclaration[] = [];
	if (retained.length)
		declarations.push(
			factory.updateExportDeclaration(
				node,
				node.modifiers,
				false,
				factory.createNamedExports(retained),
				node.moduleSpecifier,
				node.attributes
			)
		);
	for (const [targetModule, specifiers] of [...grouped].sort(([left], [right]) =>
		left.localeCompare(right)
	)) {
		declarations.push(
			factory.createExportDeclaration(
				undefined,
				false,
				factory.createNamedExports(specifiers),
				factory.createStringLiteral(targetModule),
				undefined
			)
		);
	}
	return declarations;
}

export function replacementIndex(
	values: readonly ModuleExportReplacement[]
): Map<string, Map<string, ModuleExportReplacement>> {
	const result = new Map<string, Map<string, ModuleExportReplacement>>();
	for (const value of values) {
		let exports = result.get(value.sourceModule);
		if (!exports) {
			exports = new Map();
			result.set(value.sourceModule, exports);
		}
		if (exports.has(value.sourceExport))
			throw new Error(
				`Duplicate module replacement for ${value.sourceModule}.${value.sourceExport}`
			);
		exports.set(value.sourceExport, value);
	}
	return result;
}

function targetGroup(
	grouped: Map<
		string,
		{ targetModule: string; specifiers: ts.ImportSpecifier[]; defaultName?: ts.Identifier }
	>,
	targetModule: string
): { targetModule: string; specifiers: ts.ImportSpecifier[]; defaultName?: ts.Identifier } {
	let group = grouped.get(targetModule);
	if (!group) {
		group = { targetModule, specifiers: [] };
		grouped.set(targetModule, group);
	}
	return group;
}
