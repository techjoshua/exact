import type { ModuleExportReplacement } from '@exact/expressions';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { createReactCompatPackageGraph, ResolvedReactCompatAdapters } from '../adapters.js';

import type { ReactCompatibilityDiagnostic, ReactCompatibilitySelection } from './contracts.js';

export function recordSelection(
	selections: Map<string, ReactCompatibilitySelection>,
	selection: ReactCompatibilitySelection
): void {
	const key = [
		selection.importer,
		selection.status,
		selection.sourceLocation,
		selection.sourceModule,
		selection.sourceExport,
		selection.targetModule ?? '',
		selection.targetExport ?? '',
		selection.reason ?? ''
	].join('\0');
	selections.set(key, Object.freeze(selection));
}

export function runtimeSourceExports(
	source: string,
	filename: string,
	sourceModule: string
): string[] {
	const sourceFile = ts.createSourceFile(
		filename,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(filename)
	);
	const exports = new Set<string>();
	const namespaces = new Set<string>();
	for (const statement of sourceFile.statements) {
		if (
			ts.isImportDeclaration(statement) &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			statement.moduleSpecifier.text === sourceModule &&
			!statement.importClause?.isTypeOnly
		) {
			const clause = statement.importClause;
			if (!clause) {
				exports.add('*');
				continue;
			}
			if (clause.name) exports.add('default');
			if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
				for (const element of clause.namedBindings.elements) {
					if (!element.isTypeOnly) exports.add(element.propertyName?.text ?? element.name.text);
				}
			} else if (clause.namedBindings) namespaces.add(clause.namedBindings.name.text);
		}
		if (
			ts.isExportDeclaration(statement) &&
			statement.moduleSpecifier &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			statement.moduleSpecifier.text === sourceModule &&
			!statement.isTypeOnly
		) {
			if (!statement.exportClause) exports.add('*');
			else if (ts.isNamedExports(statement.exportClause)) {
				for (const element of statement.exportClause.elements) {
					if (!element.isTypeOnly) exports.add(element.propertyName?.text ?? element.name.text);
				}
			} else exports.add('*');
		}
	}
	const visit = (node: ts.Node): void => {
		if (
			ts.isIdentifier(node) &&
			namespaces.has(node.text) &&
			!ts.isNamespaceImport(node.parent) &&
			!(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) &&
			!(ts.isElementAccessExpression(node.parent) && node.parent.expression === node)
		) {
			exports.add('*');
		}
		if (
			ts.isCallExpression(node) &&
			node.arguments.length &&
			ts.isStringLiteral(node.arguments[0]) &&
			node.arguments[0].text === sourceModule &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) && node.expression.text === 'require'))
		) {
			const parent = node.parent;
			if (ts.isPropertyAccessExpression(parent)) exports.add(parent.name.text);
			else if (
				ts.isElementAccessExpression(parent) &&
				parent.argumentExpression &&
				ts.isStringLiteral(parent.argumentExpression)
			) {
				exports.add(parent.argumentExpression.text);
			} else if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) {
				for (const element of parent.name.elements) {
					if (element.dotDotDotToken) exports.add('*');
					else if (
						element.propertyName &&
						(ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName))
					)
						exports.add(element.propertyName.text);
					else if (ts.isIdentifier(element.name)) exports.add(element.name.text);
				}
			} else exports.add('*');
		}
		if (
			(ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
			ts.isIdentifier(node.expression) &&
			namespaces.has(node.expression.text)
		) {
			if (ts.isPropertyAccessExpression(node)) exports.add(node.name.text);
			else if (node.argumentExpression && ts.isStringLiteral(node.argumentExpression))
				exports.add(node.argumentExpression.text);
			else exports.add('*');
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return [...exports];
}

export function scriptKind(filename: string): ts.ScriptKind {
	const clean = filename.split('?', 1)[0]!;
	if (/\.tsx$/i.test(clean)) return ts.ScriptKind.TSX;
	if (/\.jsx$/i.test(clean)) return ts.ScriptKind.JSX;
	if (/\.[cm]?js$/i.test(clean)) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}

export function moduleReplacements(
	values: readonly import('../adapters.js').ResolvedReactCompatReplacement[]
): readonly ModuleExportReplacement[] {
	return values.map((replacement) => ({
		sourceModule: replacement.sourceModule,
		sourceExport: replacement.sourceExport,
		targetModule: replacement.specifier,
		targetExport: replacement.export
	}));
}

export function discoverWatchFiles(
	buildRoot: string,
	graph: ReturnType<typeof createReactCompatPackageGraph>,
	adapters: readonly string[]
): readonly string[] {
	const files = new Set<string>();
	const root = graph.nodes.get(graph.rootId);
	if (root) files.add(path.join(root.location, 'package.json'));
	for (const node of graph.nodes.values()) {
		if (typeof node.manifest.name === 'string' && adapters.includes(node.manifest.name))
			files.add(path.join(node.location, 'package.json'));
	}
	try {
		files.add(findUp(buildRoot, 'package-lock.json'));
	} catch {}
	return Object.freeze([...files].sort());
}

export function fileSignature(files: readonly string[]): string {
	return files
		.map((file) => {
			try {
				const stat = statSync(file);
				return `${file}:${stat.size}:${stat.mtimeMs}`;
			} catch {
				return `${file}:missing`;
			}
		})
		.join('|');
}

export function findUp(cwd: string, filename: string): string {
	let directory = path.resolve(cwd);
	while (true) {
		const candidate = path.join(directory, filename);
		try {
			readFileSync(candidate, 'utf8');
			return candidate;
		} catch {}
		const parent = path.dirname(directory);
		if (parent === directory) throw new Error(`${filename} was not found above ${cwd}`);
		directory = parent;
	}
}

export function containsCandidate(
	source: string,
	aliases: Readonly<Record<string, string>>,
	replacements: readonly ModuleExportReplacement[]
): boolean {
	return [...Object.keys(aliases), ...replacements.map((value) => value.sourceModule)].some(
		(module) => containsModule(source, module)
	);
}

export function containsModule(source: string, module: string): boolean {
	return source.includes(`"${module}"`) || source.includes(`'${module}'`);
}

export function fallbackDiagnostics(
	moduleId: string,
	source: string,
	replacements: readonly import('../adapters.js').ResolvedReactCompatReplacement[],
	buildRoot: string
): ReactCompatibilityDiagnostic[] {
	const diagnostics: ReactCompatibilityDiagnostic[] = [];
	for (const replacement of replacements) {
		const sourceModule = replacement.sourceModule;
		const escaped = sourceModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		if (new RegExp(`\\bimport\\s*\\(\\s*["']${escaped}["']`).test(source))
			diagnostics.push({
				severity: 'warning',
				code: 'dynamic-export-escape',
				message: `Dynamic import of ${sourceModule} cannot select registered export replacements statically`,
				moduleId,
				sourceModule,
				sourceExport: replacement.sourceExport,
				sourceVersion: replacement.sourceVersion,
				adapterPackage: replacement.adapterPackage,
				adapterVersion: replacement.adapterVersion,
				replacementExport: replacement.export,
				buildRoot
			});
		if (
			new RegExp(`\\{[^}]*\\.\\.\\.[^}]*\\}\\s*=\\s*require\\(\\s*["']${escaped}["']`).test(source)
		)
			diagnostics.push({
				severity: 'warning',
				code: 'unsupported-commonjs',
				message: `Rest destructuring from ${sourceModule} remains on the compatibility source module`,
				moduleId,
				sourceModule,
				sourceExport: replacement.sourceExport,
				sourceVersion: replacement.sourceVersion,
				adapterPackage: replacement.adapterPackage,
				adapterVersion: replacement.adapterVersion,
				replacementExport: replacement.export,
				buildRoot
			});
	}
	return diagnostics;
}

export function retainedDiagnostics(
	moduleId: string,
	code: string,
	registry: ResolvedReactCompatAdapters,
	buildRoot: string
): ReactCompatibilityDiagnostic[] {
	const diagnostics: ReactCompatibilityDiagnostic[] = [];
	for (const replacement of registry.replacements.values()) {
		if (!containsModule(code, replacement.sourceModule)) continue;
		diagnostics.push({
			severity: 'info',
			code: 'compatibility-retained',
			message: `${replacement.sourceModule} remains because this module has runtime uses outside the ${replacement.sourceExport} substitution`,
			moduleId,
			sourceModule: replacement.sourceModule,
			sourceExport: replacement.sourceExport,
			sourceVersion: replacement.sourceVersion,
			adapterPackage: replacement.adapterPackage,
			adapterVersion: replacement.adapterVersion,
			replacementExport: replacement.export,
			buildRoot
		});
	}
	return diagnostics;
}
