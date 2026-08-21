import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { writeExactPublishedComponentBuildFacts } from '@exactjs/compiler/component-library-build';

const packageRoot = path.resolve(process.argv[2] ?? process.cwd());
const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
if (!manifest.name || !manifest.version)
	throw new Error(`Component library at ${packageRoot} requires a package name and version`);
const declaration = manifest.exactComponentLibrary;
if (declaration?.protocol !== 1 || typeof declaration.build !== 'string')
	throw new Error(`${manifest.name} must declare protocol-1 exactComponentLibrary.build`);

if (manifest.exactCompiledComponents) {
	await writeCompiledBuildFacts();
	process.exit(0);
}

const configPath = ts.findConfigFile(packageRoot, ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error(`No tsconfig.json found for ${manifest.name}`);
const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, packageRoot);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const identities = new Map();
const componentAliases = [];

for (const sourceFile of program.getSourceFiles()) {
	if (!inside(packageRoot, sourceFile.fileName) || sourceFile.isDeclarationFile) continue;
	visit(sourceFile, (node) => {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer &&
			ts.isIdentifier(node.initializer)
		) {
			const alias = checker.getSymbolAtLocation(node.name);
			const target = checker.getSymbolAtLocation(node.initializer);
			if (alias && target)
				componentAliases.push([resolveAlias(alias, checker), resolveAlias(target, checker)]);
		}
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'markExactComponent'
		) {
			const identity = node.arguments[1];
			if (identity && ts.isStringLiteralLike(identity)) {
				const symbol = componentSymbol(node.arguments[0], checker);
				if (symbol) identities.set(resolveAlias(symbol, checker), identity.text);
			}
		}
		if (ts.isArrayLiteralExpression(node))
			for (const item of node.elements) {
				if (!ts.isArrayLiteralExpression(item) || item.elements.length < 2) continue;
				const component = item.elements[0];
				const identity = item.elements[1];
				if (!component || !identity || !ts.isStringLiteralLike(identity)) continue;
				if (!identity.text.startsWith(`${manifest.name}:`)) continue;
				const symbol = componentSymbol(component, checker);
				if (symbol) identities.set(resolveAlias(symbol, checker), identity.text);
			}
	});
}

let propagated = true;
while (propagated) {
	propagated = false;
	for (const [alias, target] of componentAliases) {
		const identity = identities.get(target);
		if (identity && !identities.has(alias)) {
			identities.set(alias, identity);
			propagated = true;
		}
	}
}

const modules = new Map();
const exports = [];
for (const [subpath, declarationValue] of Object.entries(normalizeExports(manifest.exports))) {
	for (const target of exportTargets(declarationValue)) {
		if (target.condition === 'types' || !target.path.endsWith('.js')) continue;
		const modulePath = normalizePath(target.path);
		const sourceFile = sourceForOutput(program, packageRoot, modulePath);
		if (!sourceFile) continue;
		const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
		if (!moduleSymbol) continue;
		const components = [];
		for (const exported of checker.getExportsOfModule(moduleSymbol)) {
			const resolved = resolveAlias(exported, checker);
			const identity = identities.get(resolved);
			if (!identity) continue;
			components.push({
				id: identity,
				placement: 'isomorphic',
				artifactTargets: ['client', 'server']
			});
			exports.push({
				subpath,
				condition: target.condition,
				module: modulePath,
				exportName: exported.escapedName === 'default' ? 'default' : exported.name,
				componentId: identity
			});
		}
		if (!components.length) continue;
		const existing = modules.get(modulePath) ?? [];
		for (const component of components)
			if (!existing.some((value) => value.id === component.id)) existing.push(component);
		modules.set(modulePath, existing);
	}
}

if (!exports.length)
	throw new Error(`${manifest.name} exposes no statically marked eXact components`);
await writeExactPublishedComponentBuildFacts(packageRoot, declaration.build, {
	package: { name: manifest.name, version: manifest.version },
	modules: [...modules].map(([modulePath, components]) => ({
		path: modulePath,
		facts: {
			protocol: 1,
			components,
			componentImports: [],
			rendererEnhancements: []
		}
	})),
	exports
});

async function writeCompiledBuildFacts() {
	const expectedBySubpath = Array.isArray(manifest.exactCompiledComponents)
		? { '.': manifest.exactCompiledComponents }
		: manifest.exactCompiledComponents;
	const expected = new Set(
		Object.entries(expectedBySubpath).flatMap(([subpath, names]) =>
			names.map((name) => `${subpath}:${name}`)
		)
	);
	const modules = new Map();
	const exports = [];
	const discovered = new Set();
	for (const [subpath, declarationValue] of Object.entries(normalizeExports(manifest.exports))) {
		for (const target of exportTargets(declarationValue)) {
			if (target.condition === 'types' || !target.path.endsWith('.js')) continue;
			const modulePath = normalizePath(target.path);
			const namespace = await import(
				`${pathToFileURL(path.join(packageRoot, modulePath)).href}?exact-build-facts=${Date.now()}`
			);
			const components = [];
			for (const [exportName, value] of Object.entries(namespace)) {
				const expectedKey = `${subpath}:${exportName}`;
				if (!expected.has(expectedKey) || typeof value !== 'function') continue;
				const id = value[Symbol.for('@exactjs/component')];
				const contract = value[Symbol.for('@exactjs/component-contract')];
				if (typeof id !== 'string' || !contract?.definition) continue;
				discovered.add(expectedKey);
				components.push({
					id,
					placement: contract.placement,
					artifactTargets: [contract.role === 'executor' ? 'server' : 'client']
				});
				exports.push({
					subpath,
					condition: target.condition,
					module: modulePath,
					exportName,
					componentId: id
				});
			}
			if (components.length) modules.set(modulePath, components);
		}
	}
	const missing = [...expected].filter((name) => !discovered.has(name));
	if (missing.length)
		throw new Error(`${manifest.name} is missing compiled exports: ${missing.join(', ')}`);
	await writeExactPublishedComponentBuildFacts(packageRoot, declaration.build, {
		package: { name: manifest.name, version: manifest.version },
		modules: [...modules].map(([modulePath, components]) => ({
			path: modulePath,
			facts: { protocol: 1, components, componentImports: [], rendererEnhancements: [] }
		})),
		exports
	});
}

function visit(node, callback) {
	callback(node);
	ts.forEachChild(node, (child) => visit(child, callback));
}

function componentSymbol(expression, checker) {
	if (!expression) return undefined;
	if (ts.isIdentifier(expression)) return checker.getSymbolAtLocation(expression);
	if (ts.isFunctionExpression(expression) || ts.isArrowFunction(expression)) {
		const parent = expression.parent;
		if (ts.isCallExpression(parent) && ts.isVariableDeclaration(parent.parent))
			return checker.getSymbolAtLocation(parent.parent.name);
	}
	return undefined;
}

function resolveAlias(symbol, checker) {
	let current = symbol;
	const seen = new Set();
	while ((current.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(current)) {
		seen.add(current);
		current = checker.getAliasedSymbol(current);
	}
	return current;
}

function normalizeExports(value) {
	if (typeof value === 'string' || Array.isArray(value) || !value) return { '.': value };
	return Object.keys(value).some((key) => key.startsWith('.')) ? value : { '.': value };
}

function exportTargets(value, inheritedCondition = 'default') {
	if (typeof value === 'string') return [{ condition: inheritedCondition, path: value }];
	if (Array.isArray(value))
		return value.flatMap((entry) => exportTargets(entry, inheritedCondition));
	if (!value || typeof value !== 'object') return [];
	return Object.entries(value).flatMap(([condition, entry]) => exportTargets(entry, condition));
}

function sourceForOutput(program, root, modulePath) {
	const relative = modulePath.replace(/^dist\//, '').replace(/\.js$/, '');
	const candidates = [`.tsx`, `.ts`, `/index.tsx`, `/index.ts`].map((suffix) =>
		path.resolve(root, 'src', `${relative}${suffix}`)
	);
	return program
		.getSourceFiles()
		.find((sourceFile) => candidates.some((candidate) => samePath(sourceFile.fileName, candidate)));
}

function inside(root, filename) {
	const relative = path.relative(root, filename);
	return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalizePath(value) {
	return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function samePath(left, right) {
	return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}
