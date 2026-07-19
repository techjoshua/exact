import ts from 'typescript';
import { createLineSourceMap } from './source-map.js';
import { rewriteCommonJsDestructuring } from './module/commonjs.js';
import type {
	ModuleExportReplacement,
	ModuleRewriteOptions,
	ModuleRewriteResult
} from './module/contracts.js';
export type {
	ModuleExportReplacement,
	ModuleRewriteOptions,
	ModuleRewriteResult
} from './module/contracts.js';
import {
	replacementIndex,
	rewriteExportDeclaration,
	rewriteImportDeclaration
} from './module/declarations.js';
import { injectedAdapterImport } from './module/emission.js';
import { isModuleCall, isRequireCall } from './module/inspection.js';
import { bindSourceFile } from './module/program.js';

/**
 * Rewrites module references in one structural pass. Unmapped bindings stay on
 * their original module and mapped bindings are grouped by public target export.
 */
export function rewriteModuleReferences(
	source: string,
	options: ModuleRewriteOptions = {}
): ModuleRewriteResult {
	const filename = options.filename ?? 'input.js';
	const { sourceFile, checker } = bindSourceFile(filename, source);
	const aliases = options.moduleAliases ?? {};
	const replacements = replacementIndex(options.replacements ?? []);
	let changed = false;

	const result = ts.transform(sourceFile, [
		(context) => {
			const factory = context.factory;
			const namespaceImports = new Map<ts.Symbol, ReadonlyMap<string, ModuleExportReplacement>>();
			const injectedImports = new Map<
				string,
				{ targetModule: string; targetExport: string; local: ts.Identifier }
			>();
			for (const statement of sourceFile.statements) {
				if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
					continue;
				const bindings = statement.importClause?.namedBindings;
				const byExport = replacements.get(statement.moduleSpecifier.text);
				if (!byExport || !bindings || !ts.isNamespaceImport(bindings)) continue;
				const symbol = checker.getSymbolAtLocation(bindings.name);
				if (symbol) namespaceImports.set(symbol, byExport);
			}
			const visitor: ts.Visitor = (node) => {
				if (ts.isVariableStatement(node)) {
					const rewritten = rewriteCommonJsDestructuring(factory, node, replacements);
					if (rewritten !== node) {
						changed = true;
						return rewritten;
					}
				}
				if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
					const sourceModule = node.moduleSpecifier.text;
					const aliased = aliases[sourceModule];
					if (aliased) {
						changed = true;
						return factory.updateImportDeclaration(
							node,
							node.modifiers,
							node.importClause,
							factory.createStringLiteral(aliased),
							node.attributes
						);
					}
					const byExport = replacements.get(sourceModule);
					if (!byExport || !node.importClause || node.importClause.isTypeOnly) return node;
					const rewritten = rewriteImportDeclaration(factory, node, byExport);
					if (rewritten !== node) changed = true;
					return rewritten;
				}
				if (
					ts.isExportDeclaration(node) &&
					node.moduleSpecifier &&
					ts.isStringLiteral(node.moduleSpecifier)
				) {
					const sourceModule = node.moduleSpecifier.text;
					const aliased = aliases[sourceModule];
					if (aliased) {
						changed = true;
						return factory.updateExportDeclaration(
							node,
							node.modifiers,
							node.isTypeOnly,
							node.exportClause,
							factory.createStringLiteral(aliased),
							node.attributes
						);
					}
					const byExport = replacements.get(sourceModule);
					if (
						!byExport ||
						!node.exportClause ||
						!ts.isNamedExports(node.exportClause) ||
						node.isTypeOnly
					)
						return node;
					const rewritten = rewriteExportDeclaration(factory, node, byExport);
					if (rewritten !== node) changed = true;
					return rewritten;
				}
				if (isModuleCall(node)) {
					const request = node.arguments[0];
					const aliased = aliases[request.text];
					if (aliased) {
						changed = true;
						return factory.updateCallExpression(node, node.expression, node.typeArguments, [
							factory.createStringLiteral(aliased),
							...node.arguments.slice(1)
						]);
					}
				}
				if (ts.isPropertyAccessExpression(node) && isRequireCall(node.expression)) {
					const request = node.expression.arguments[0];
					const replacement = replacements.get(request.text)?.get(node.name.text);
					if (replacement) {
						changed = true;
						return factory.createPropertyAccessExpression(
							factory.updateCallExpression(
								node.expression,
								node.expression.expression,
								node.expression.typeArguments,
								[factory.createStringLiteral(replacement.targetModule)]
							),
							replacement.targetExport
						);
					}
				}
				if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
					const replacement = namespaceImports
						.get(checker.getSymbolAtLocation(node.expression)!)
						?.get(node.name.text);
					if (replacement) {
						changed = true;
						return injectedAdapterImport(factory, injectedImports, replacement);
					}
				}
				if (
					ts.isElementAccessExpression(node) &&
					isRequireCall(node.expression) &&
					node.argumentExpression &&
					ts.isStringLiteral(node.argumentExpression)
				) {
					const request = node.expression.arguments[0];
					const replacement = replacements.get(request.text)?.get(node.argumentExpression.text);
					if (replacement) {
						changed = true;
						return factory.createElementAccessExpression(
							factory.updateCallExpression(
								node.expression,
								node.expression.expression,
								node.expression.typeArguments,
								[factory.createStringLiteral(replacement.targetModule)]
							),
							factory.createStringLiteral(replacement.targetExport)
						);
					}
				}
				if (
					ts.isElementAccessExpression(node) &&
					ts.isIdentifier(node.expression) &&
					node.argumentExpression &&
					ts.isStringLiteral(node.argumentExpression)
				) {
					const replacement = namespaceImports
						.get(checker.getSymbolAtLocation(node.expression)!)
						?.get(node.argumentExpression.text);
					if (replacement) {
						changed = true;
						return injectedAdapterImport(factory, injectedImports, replacement);
					}
				}
				return ts.visitEachChild(node, visitor, context);
			};
			return (root) => {
				const visited = ts.visitEachChild(root, visitor, context);
				if (!injectedImports.size) return visited;
				const imports = [...injectedImports.values()].map((value) =>
					factory.createImportDeclaration(
						undefined,
						factory.createImportClause(
							false,
							undefined,
							factory.createNamedImports([
								factory.createImportSpecifier(
									false,
									factory.createIdentifier(value.targetExport),
									value.local
								)
							])
						),
						factory.createStringLiteral(value.targetModule),
						undefined
					)
				);
				const directiveCount = visited.statements.findIndex(
					(statement) =>
						!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)
				);
				const split = directiveCount < 0 ? visited.statements.length : directiveCount;
				return factory.updateSourceFile(visited, [
					...visited.statements.slice(0, split),
					...imports,
					...visited.statements.slice(split)
				]);
			};
		}
	]);

	const transformed = result.transformed[0] as ts.SourceFile;
	const code = changed
		? ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(transformed)
		: source;
	result.dispose();
	return {
		code,
		map:
			options.sourceMap === false || !changed ? null : createLineSourceMap(filename, source, code),
		filename,
		changed
	};
}
