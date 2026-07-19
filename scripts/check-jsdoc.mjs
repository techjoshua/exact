import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const maintainedRoots = [
	'packages',
	'framework-adapters',
	'react-adapters',
	'plugins',
	'component-libraries',
	'apps',
	'scripts'
];
const ignoredDirectories = new Set([
	'.exact',
	'.tmp',
	'build',
	'coverage',
	'dist',
	'fixtures',
	'generated',
	'node_modules',
	'reference',
	'test-fixtures',
	'test-support'
]);
const failures = [];

for (const maintainedRoot of maintainedRoots) {
	for (const filename of await sourceFiles(path.join(root, maintainedRoot))) {
		await inspectFile(filename);
	}
}

if (failures.length) {
	console.error('JSDoc contract failures:\n' + failures.map((value) => `- ${value}`).join('\n'));
	process.exitCode = 1;
} else {
	console.log('JSDoc contracts ok');
}

async function inspectFile(filename) {
	const relative = repositoryPath(filename);
	if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relative)) return;
	const source = await readFile(filename, 'utf8');
	const sourceFile = ts.createSourceFile(
		filename,
		source,
		ts.ScriptTarget.Latest,
		true,
		filename.endsWith('x') ? ts.ScriptKind.TSX : scriptKind(filename)
	);
	const documentedOverloads = documentedFunctionOverloads(sourceFile);

	for (const statement of sourceFile.statements) {
		if (!isExported(statement)) continue;
		if (ts.isFunctionDeclaration(statement)) {
			const name = declarationName(statement, sourceFile);
			if (!documentedOverloads.has(name))
				report(relative, sourceFile, statement, `exported function ${name}`);
			continue;
		}
		if (ts.isClassDeclaration(statement)) {
			inspectClass(relative, sourceFile, statement);
			continue;
		}
		if (
			ts.isInterfaceDeclaration(statement) ||
			ts.isTypeAliasDeclaration(statement) ||
			ts.isEnumDeclaration(statement)
		) {
			requireDocumentation(relative, sourceFile, statement, exportedDescription(statement));
			continue;
		}
		if (ts.isVariableStatement(statement) && isConst(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				requireDocumentation(
					relative,
					sourceFile,
					hasUsefulJsDoc(declaration) ? declaration : statement,
					`exported constant ${declaration.name.getText(sourceFile)}`
				);
			}
		}
	}
}

function inspectClass(relative, sourceFile, declaration) {
	const className = declarationName(declaration, sourceFile);
	requireDocumentation(relative, sourceFile, declaration, `exported class ${className}`);
	const documentedMembers = new Set(
		declaration.members
			.filter(
				(member) =>
					(ts.isMethodDeclaration(member) ||
						ts.isGetAccessorDeclaration(member) ||
						ts.isSetAccessorDeclaration(member)) &&
					hasUsefulJsDoc(member)
			)
			.map((member) => member.name.getText(sourceFile))
	);
	for (const member of declaration.members) {
		if (
			!ts.isMethodDeclaration(member) &&
			!ts.isGetAccessorDeclaration(member) &&
			!ts.isSetAccessorDeclaration(member)
		) {
			continue;
		}
		if (
			hasModifier(member, ts.SyntaxKind.PrivateKeyword) ||
			hasModifier(member, ts.SyntaxKind.ProtectedKeyword) ||
			documentedMembers.has(member.name.getText(sourceFile))
		) {
			continue;
		}
		requireDocumentation(
			relative,
			sourceFile,
			member,
			`public method ${className}.${member.name.getText(sourceFile)}`
		);
	}
}

function documentedFunctionOverloads(sourceFile) {
	const documented = new Set();
	for (const statement of sourceFile.statements) {
		if (!ts.isFunctionDeclaration(statement) || !isExported(statement)) continue;
		const name = declarationName(statement, sourceFile);
		if (hasUsefulJsDoc(statement)) documented.add(name);
	}
	return documented;
}

function requireDocumentation(relative, sourceFile, node, description) {
	if (!hasUsefulJsDoc(node)) report(relative, sourceFile, node, description);
}

function hasUsefulJsDoc(node) {
	const blocks = node.jsDoc ?? [];
	return blocks.some((block) => {
		const comment =
			typeof block.comment === 'string'
				? block.comment
				: (block.comment?.map((part) => part.text).join('') ?? '');
		return comment.trim().length >= 8;
	});
}

function exportedDescription(statement) {
	const kind = ts.isInterfaceDeclaration(statement)
		? 'interface'
		: ts.isTypeAliasDeclaration(statement)
			? 'type'
			: 'enum';
	return `exported ${kind} ${declarationName(statement)}`;
}

function declarationName(node, sourceFile) {
	return node.name?.getText(sourceFile) ?? 'default';
}

function isExported(node) {
	return (
		hasModifier(node, ts.SyntaxKind.ExportKeyword) ||
		hasModifier(node, ts.SyntaxKind.DefaultKeyword)
	);
}

function isConst(statement) {
	return (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
}

function hasModifier(node, kind) {
	return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function report(relative, sourceFile, node, description) {
	const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
	failures.push(`${relative}:${position.line + 1} ${description} needs a useful JSDoc contract`);
}

async function sourceFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await sourceFiles(filename)));
		else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(filename);
	}
	return files;
}

function scriptKind(filename) {
	if (filename.endsWith('.js') || filename.endsWith('.mjs') || filename.endsWith('.cjs'))
		return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}

function repositoryPath(filename) {
	return path.relative(root, filename).replaceAll('\\', '/');
}
