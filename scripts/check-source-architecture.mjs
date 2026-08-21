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
	'apps'
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
	'reference'
]);
const violations = [];
const legacyArchitectureCeilings = new Map([
	['apps/docs/src/styles.css', 1942],
	['apps/sudoku/src/styles.css', 1887],
	['packages/theme/styles.css', 1510],
	['apps/shipping-calculator/src/styles.css', 950],
	['apps/puzzle-generator/src/styles.css', 800],
	['apps/enhancement-playground/src/styles.css', 710],
	['apps/workbench/src/styles.css', 572],
	['packages/chromium-devtools/src/static/panel.css', 630],
	['packages/core/src/component/runtime.ts', 404],
	['plugins/microfrontends/src/client.test.ts', 601]
]);
const compilerlessComponentCeilings = new Map([
	['component-libraries/gravity/src/components.ts', 2],
	['component-libraries/motion/src/context.ts', 1],
	['component-libraries/motion/src/layout.ts', 1],
	['component-libraries/motion/src/motion-element.ts', 1],
	['component-libraries/motion/src/motion-list.ts', 1],
	['component-libraries/motion/src/motion.ts', 1],
	['component-libraries/motion/src/presence.ts', 2],
	['component-libraries/physics/src/components.ts', 2],
	['component-libraries/router/src/components.tsx', 1],
	['component-libraries/theme-fixture/src/specimen.ts', 2],
	['packages/core/src/component-registry/creation.ts', 1],
	['packages/dom/src/renderer/root-support.ts', 1],
	['packages/react-compat/src/runtime/adapters.ts', 1],
	['packages/react-compat/src/runtime/nodes.ts', 3],
	['packages/react-dom-compat/src/client.ts', 1],
	['packages/react-dom-compat/src/server-shared.ts', 1],
	['packages/testing/src/internal/fixtures.ts', 1],
	['packages/testing/src/mounting/mount.ts', 1],
	['plugins/microfrontends/src/client.ts', 1],
	['react-adapters/convex/src/adapter.ts', 1],
	['react-adapters/jotai/src/adapter.ts', 1],
	['react-adapters/redux/src/adapter.ts', 1],
	['react-adapters/tanstack-query/src/adapter.ts', 1]
]);

for (const maintainedRoot of maintainedRoots) {
	for (const file of await sourceFiles(path.join(root, maintainedRoot))) inspectSource(file);
	for (const sourceRoot of await packageSourceRoots(path.join(root, maintainedRoot)))
		await inspectFlatClusters(sourceRoot);
}
for (const file of await scriptFiles(path.join(root, 'scripts'))) {
	inspectSize(file, await readFile(file, 'utf8'), /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file));
}
await inspectLargeNonTypeScriptDomains();

if (violations.length) {
	throw new Error(`Source architecture violations:\n${violations.join('\n')}`);
}

console.log('source architecture ok');

async function inspectLargeNonTypeScriptDomains() {
	const files = await matchingFiles(root, /\.(?:go|css)$/);
	for (const file of files) {
		const relative = repositoryPath(file);
		if (
			!relative.startsWith('native/typescript-go/overlay/internal/exactcompiler/') &&
			!maintainedRoots.some((maintainedRoot) => relative.startsWith(`${maintainedRoot}/`))
		)
			continue;
		if (/_test\.go$/.test(relative)) continue;
		const lines = (await readFile(file, 'utf8')).split(/\r?\n/).length;
		const limit = file.endsWith('.go') ? 1_200 : 500;
		if (lines <= limit) continue;
		const ceiling = legacyArchitectureCeilings.get(relative);
		if (ceiling === undefined)
			violations.push(
				`${relative}: ${lines} lines requires a cohesive-domain split or owned ceiling`
			);
		else if (lines > ceiling)
			violations.push(`${relative}: ${lines} lines exceeds its legacy ceiling of ${ceiling}`);
	}
}

async function inspectSource(file) {
	const relative = repositoryPath(file);
	const source = await readFile(file, 'utf8');
	const isTest =
		/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relative) || relative.includes('/test-support/');
	inspectSize(file, source, isTest);
	if (/\/index\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relative)) {
		violations.push(`${relative}: tests must be named for the behavior they exercise`);
	}
	if (isTest) return;
	inspectCompilerlessComponentCalls(relative, source);

	const sourceFile = ts.createSourceFile(
		file,
		source,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	);
	if (/\/src\/index\.tsx?$/.test(relative)) inspectFacade(relative, sourceFile);
	inspectImports(relative, sourceFile);
	inspectOwnershipName(relative);
}

/** Prevents the temporary compilerless component surface from growing during its migration. */
function inspectCompilerlessComponentCalls(relative, source) {
	const count = source.match(/\bmarkExactComponent\s*\(/g)?.length ?? 0;
	const ceiling = compilerlessComponentCeilings.get(relative);
	if (count === 0) return;
	if (ceiling === undefined)
		violations.push(`${relative}: new compilerless native component is not permitted`);
	else if (count > ceiling)
		violations.push(
			`${relative}: ${count} compilerless components exceeds its ceiling of ${ceiling}`
		);
}

function inspectFacade(relative, sourceFile) {
	for (const statement of sourceFile.statements) {
		if (isFacadeStatement(statement)) continue;
		report(relative, sourceFile, statement, 'public entrypoint contains implementation');
	}
}

function isFacadeStatement(statement) {
	if (
		ts.isImportDeclaration(statement) ||
		ts.isExportDeclaration(statement) ||
		ts.isExportAssignment(statement) ||
		ts.isInterfaceDeclaration(statement) ||
		ts.isTypeAliasDeclaration(statement) ||
		ts.isEnumDeclaration(statement) ||
		ts.isModuleDeclaration(statement) ||
		ts.isEmptyStatement(statement)
	) {
		return true;
	}
	if (ts.isVariableStatement(statement)) {
		return statement.declarationList.declarations.every((declaration) =>
			isContractInitializer(declaration.initializer)
		);
	}
	if (ts.isFunctionDeclaration(statement)) {
		return !statement.body || statement.body.statements.length <= 3;
	}
	return false;
}

function isContractInitializer(initializer) {
	if (!initializer) return true;
	return (
		ts.isStringLiteralLike(initializer) ||
		ts.isNumericLiteral(initializer) ||
		initializer.kind === ts.SyntaxKind.TrueKeyword ||
		initializer.kind === ts.SyntaxKind.FalseKeyword ||
		ts.isAsExpression(initializer) ||
		ts.isTypeAssertionExpression(initializer)
	);
}

function inspectImports(relative, sourceFile) {
	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
		const specifier = statement.moduleSpecifier;
		if (!specifier || !ts.isStringLiteralLike(specifier)) continue;
		const request = specifier.text;
		if (/(?:^|\/)(?:\.\.\/|\.\/)*index\.js$/.test(request)) {
			report(relative, sourceFile, statement, `imports public facade ${request}`);
		}
		if (request.includes('test-support')) {
			report(relative, sourceFile, statement, 'production module imports test-support code');
		}
	}
}

function inspectOwnershipName(relative) {
	const name = path.basename(relative).replace(/\.[^.]+$/, '');
	if (/^(?:common|helpers?|utils?)$/i.test(name)) {
		violations.push(`${relative}: generic module name must be replaced by a domain owner`);
	}
}

function inspectSize(file, source, isTest = false) {
	const relative = repositoryPath(file);
	const logicalLines = logicalLineCount(file, source ?? '');
	const limit = isTest ? 600 : 400;
	if (logicalLines > limit) {
		const ceiling = legacyArchitectureCeilings.get(relative);
		if (ceiling === undefined)
			violations.push(`${relative}: ${logicalLines} logical lines exceeds the ${limit}-line limit`);
		else if (logicalLines > ceiling)
			violations.push(
				`${relative}: ${logicalLines} logical lines exceeds its ceiling of ${ceiling}`
			);
	}
}

function logicalLineCount(file, source) {
	const sourceFile = ts.createSourceFile(
		file,
		source,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	);
	const literalSpans = [];
	const collectLiteralSpans = (node) => {
		if (
			ts.isStringLiteralLike(node) ||
			node.kind === ts.SyntaxKind.TemplateHead ||
			node.kind === ts.SyntaxKind.TemplateMiddle ||
			node.kind === ts.SyntaxKind.TemplateTail
		) {
			literalSpans.push([node.getStart(sourceFile), node.end]);
		}
		ts.forEachChild(node, collectLiteralSpans);
	};
	collectLiteralSpans(sourceFile);
	const withoutLiteralPayloads = source.split('');
	for (const [start, end] of literalSpans) {
		for (let offset = start + 1; offset < end; offset++) {
			if (withoutLiteralPayloads[offset] !== '\n' && withoutLiteralPayloads[offset] !== '\r')
				withoutLiteralPayloads[offset] = ' ';
		}
	}
	source = withoutLiteralPayloads.join('');
	let inBlockComment = false;
	let count = 0;
	for (const line of source.split(/\r?\n/)) {
		let code = line;
		if (inBlockComment) {
			const end = code.indexOf('*/');
			if (end < 0) continue;
			code = code.slice(end + 2);
			inBlockComment = false;
		}
		while (true) {
			const block = code.indexOf('/*');
			const single = code.indexOf('//');
			if (single >= 0 && (block < 0 || single < block)) {
				code = code.slice(0, single);
				break;
			}
			if (block < 0) break;
			const end = code.indexOf('*/', block + 2);
			if (end < 0) {
				code = code.slice(0, block);
				inBlockComment = true;
				break;
			}
			code = code.slice(0, block) + code.slice(end + 2);
		}
		if (code.trim()) count++;
	}
	return count;
}

async function inspectFlatClusters(sourceRoot) {
	const entries = await readdir(sourceRoot, { withFileTypes: true });
	const publicSubpaths = await declaredPublicSubpaths(path.dirname(sourceRoot));
	const groups = new Map();
	for (const entry of entries) {
		if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name) || /\.test\./.test(entry.name))
			continue;
		const stem = entry.name.replace(/\.[^.]+$/, '');
		const separator = stem.indexOf('-');
		if (separator < 1 || publicSubpaths.has(stem)) continue;
		const prefix = stem.slice(0, separator);
		const names = groups.get(prefix) ?? [];
		names.push(entry.name);
		groups.set(prefix, names);
	}
	for (const [prefix, names] of groups) {
		if (names.length < 3) continue;
		violations.push(
			`${repositoryPath(sourceRoot)}: flat "${prefix}-*" cluster (${names.join(', ')}) needs a domain folder`
		);
	}
}

async function declaredPublicSubpaths(packageRoot) {
	try {
		const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
		const result = new Set();
		for (const key of Object.keys(manifest.exports ?? {})) {
			if (!key.startsWith('./')) continue;
			result.add(key.slice(2));
		}
		return result;
	} catch {
		return new Set();
	}
}

async function packageSourceRoots(directory) {
	const roots = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) continue;
		const child = path.join(directory, entry.name);
		try {
			const entries = await readdir(child);
			if (entries.includes('package.json') && entries.includes('src')) {
				roots.push(path.join(child, 'src'));
			} else {
				roots.push(...(await packageSourceRoots(child)));
			}
		} catch {
			// A concurrently removed directory is irrelevant to the static inventory.
		}
	}
	return roots;
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

async function matchingFiles(directory, pattern) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await matchingFiles(filename, pattern)));
		else if (pattern.test(entry.name)) files.push(filename);
	}
	return files;
}

async function scriptFiles(directory) {
	return (await sourceFiles(directory)).filter(
		(file) => !repositoryPath(file).includes('/fixtures/')
	);
}

function report(relative, sourceFile, node, message) {
	const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
	violations.push(`${relative}:${position.line + 1} ${message}`);
}

function repositoryPath(file) {
	return path.relative(root, file).replaceAll('\\', '/');
}
