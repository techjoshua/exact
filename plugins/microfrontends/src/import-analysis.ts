import ts from 'typescript';
import type { ExactProvidedPackageImportUsage } from './artifacts.js';

/** Finds the static import shape used for each exact configured provider key. */
export function analyzeProvidedPackageImports(
	code: string,
	filename: string,
	providedKeys: readonly string[]
): ReadonlyMap<string, readonly ExactProvidedPackageImportUsage[]> {
	const keys = new Set(providedKeys);
	const usages = new Map<string, ExactProvidedPackageImportUsage[]>();
	const namespaces = new Map<string, { key: string; declaration: ts.NamespaceImport }>();
	const source = ts.createSourceFile(
		filename,
		code,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(filename)
	);
	const add = (key: string, usage: ExactProvidedPackageImportUsage): void => {
		const values = usages.get(key) ?? [];
		values.push(usage);
		usages.set(key, values);
	};

	for (const statement of source.statements) {
		if (ts.isExportDeclaration(statement)) {
			const key = moduleKey(statement.moduleSpecifier, keys);
			if (key) {
				if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
					add(key, { kind: 're-export' });
					continue;
				}
				for (const element of statement.exportClause.elements) {
					if (!statement.isTypeOnly && !element.isTypeOnly)
						add(key, {
							kind: 'named',
							imported: (element.propertyName ?? element.name).text
						});
				}
				continue;
			}
		}
		if (!ts.isImportDeclaration(statement)) continue;
		const key = moduleKey(statement.moduleSpecifier, keys);
		if (!key) continue;
		const clause = statement.importClause;
		if (!clause) {
			add(key, { kind: 'side-effect' });
			continue;
		}
		if (clause.isTypeOnly) continue;
		if (clause.name) add(key, { kind: 'default' });
		if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
			namespaces.set(clause.namedBindings.name.text, {
				key,
				declaration: clause.namedBindings
			});
		}
		if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
			// `import {} from` still evaluates the imported module even though it binds no names.
			// TypeScript can retain this shape for value-bearing package edges after declaration emit.
			if (clause.namedBindings.elements.length === 0) add(key, { kind: 'side-effect' });
			for (const element of clause.namedBindings.elements) {
				if (!element.isTypeOnly)
					add(key, { kind: 'named', imported: (element.propertyName ?? element.name).text });
			}
		}
	}

	const namespaceExports = new Map<string, Set<string>>();
	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments.length === 1
		) {
			const key = moduleKey(node.arguments[0], keys);
			if (key)
				throw new Error(
					`Dynamic imports of provided package ${JSON.stringify(key)} are not supported`
				);
		}
		if (ts.isIdentifier(node)) {
			const namespace = namespaces.get(node.text);
			if (namespace && node !== namespace.declaration.name) {
				const parent = node.parent;
				let exported: string | undefined;
				if (ts.isPropertyAccessExpression(parent) && parent.expression === node)
					exported = parent.name.text;
				else if (
					ts.isElementAccessExpression(parent) &&
					parent.expression === node &&
					parent.argumentExpression &&
					ts.isStringLiteral(parent.argumentExpression)
				)
					exported = parent.argumentExpression.text;
				else
					throw new Error(
						`Namespace import ${node.text} from ${JSON.stringify(namespace.key)} must use static property access`
					);
				const names = namespaceExports.get(node.text) ?? new Set<string>();
				names.add(exported);
				namespaceExports.set(node.text, names);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	for (const [local, namespace] of namespaces) {
		add(namespace.key, {
			kind: 'namespace',
			exportNames: [...(namespaceExports.get(local) ?? [])].sort()
		});
	}
	return new Map([...usages].map(([key, values]) => [key, Object.freeze(values)] as const));
}

function moduleKey(node: ts.Node | undefined, keys: ReadonlySet<string>): string | undefined {
	return node && ts.isStringLiteral(node) && keys.has(node.text) ? node.text : undefined;
}

function scriptKind(filename: string): ts.ScriptKind {
	if (/\.tsx(?:$|\?)/i.test(filename)) return ts.ScriptKind.TSX;
	if (/\.jsx(?:$|\?)/i.test(filename)) return ts.ScriptKind.JSX;
	if (/\.[cm]?ts(?:$|\?)/i.test(filename)) return ts.ScriptKind.TS;
	return ts.ScriptKind.JS;
}
