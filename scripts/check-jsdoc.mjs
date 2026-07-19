import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const contractModules = [
	'component-libraries/router/src/core.ts',
	'component-libraries/router/src/modern.ts',
	'component-libraries/router/src/modern/paths.ts',
	'component-libraries/router/src/modern/responses.ts',
	'packages/compiler/src/adapter-support.ts',
	'packages/compiler/src/emission/helpers.ts',
	'packages/compiler/src/emission/state-writes.ts',
	'packages/compiler/src/policy/algebra.ts',
	'packages/core/src/cleanup.ts',
	'packages/core/src/task/signals.ts',
	'packages/dom/src/renderer/limits.ts',
	'packages/dom/src/renderer/reconciliation.ts',
	'packages/hydrate/src/adoption/form-state.ts',
	'packages/hydrate/src/adoption/static-tree.ts',
	'packages/react-compat/src/index.ts',
	'packages/react-compat/src/runtime/hook-slots.ts',
	'packages/react-dom-compat/src/index.ts',
	'packages/reactive/src/internal/values.ts',
	'packages/server/src/operations.ts',
	'packages/ssr/src/render/limits.ts'
];

const failures = [];

for (const relative of contractModules) {
	const filename = path.join(root, relative);
	const source = fs.readFileSync(filename, 'utf8');
	const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
	const documentedOverloads = new Set();

	for (const statement of sourceFile.statements) {
		if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
		if (ts.isFunctionDeclaration(statement)) {
			const name = statement.name?.text ?? 'default';
			if (hasJsDoc(statement)) documentedOverloads.add(name);
			if (!documentedOverloads.has(name))
				report(relative, sourceFile, statement, `exported function ${name}`);
		} else if (ts.isClassDeclaration(statement)) {
			const className = statement.name?.text ?? 'default';
			if (!hasJsDoc(statement))
				report(relative, sourceFile, statement, `exported class ${className}`);
			for (const member of statement.members) {
				if (!ts.isMethodDeclaration(member) || hasModifier(member, ts.SyntaxKind.PrivateKeyword))
					continue;
				const name = member.name.getText(sourceFile);
				if (!hasJsDoc(member))
					report(relative, sourceFile, member, `public method ${className}.${name}`);
			}
		}
	}
}

if (failures.length) {
	console.error('JSDoc contract failures:\n' + failures.map((value) => `- ${value}`).join('\n'));
	process.exitCode = 1;
} else {
	console.log(`JSDoc contracts ok (${contractModules.length} modules)`);
}

function hasModifier(node, kind) {
	return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function hasJsDoc(node) {
	return ts.getJSDocCommentsAndTags(node).length > 0;
}

function report(relative, sourceFile, node, description) {
	const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
	failures.push(`${relative}:${position.line + 1} ${description} needs a useful JSDoc contract`);
}
