import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('packages/core/src/index.ts', 'utf8');
const ownership = JSON.parse(await readFile('packages/core/api-ownership.json', 'utf8'));
const classified = new Map();
for (const [owner, modules] of Object.entries(ownership))
	for (const module of modules) {
		if (classified.has(module)) throw new Error(`${module} has multiple core API owners`);
		classified.set(module, owner);
	}
const sourceFile = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const exportedModules = new Set();
const exportedNames = new Set();
for (const statement of sourceFile.statements)
	if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
		exportedModules.add(statement.moduleSpecifier.text);
		if (statement.exportClause && ts.isNamedExports(statement.exportClause))
			for (const element of statement.exportClause.elements) exportedNames.add(element.name.text);
	}
const missing = [...exportedModules].filter((module) => !classified.has(module));
const staleApplication = ownership.application.filter((module) => !exportedModules.has(module));
const forbiddenRootNames = [
	'RenderProgram',
	'ServerBoundary',
	'ServerSlot',
	'createCellVNode',
	'createCompiledComponentRegistry',
	'createCompiledComponentVNode',
	'createCompiledFragment',
	'createCompiledTarget',
	'createCompiledVNode',
	'createComponentInstance',
	'createDynamicChild',
	'createExpression',
	'createForwardedExpression',
	'createKeyedServerSlot',
	'createServerBoundary',
	'createServerSlot',
	'getCellVNode',
	'isCellVNode',
	'renderInstance',
	'reparentComponentInstance'
];
const leaked = forbiddenRootNames.filter((name) => exportedNames.has(name));
const forbiddenModules = [
	'./component/render.js',
	'./component/runtime.js',
	'./component-contracts.js'
];
const leakedModules = forbiddenModules.filter((module) => exportedModules.has(module));
if (missing.length || staleApplication.length || leaked.length || leakedModules.length)
	throw new Error(
		`Core API ownership mismatch:${missing.map((module) => `\n- unclassified ${module}`).join('')}${staleApplication.map((module) => `\n- missing application module ${module}`).join('')}${leakedModules.map((module) => `\n- compiler module exported from root ${module}`).join('')}${leaked.map((name) => `\n- internal symbol exported from root ${name}`).join('')}`
	);
console.log(
	`core API ownership ok (${exportedModules.size} modules classified; compiler render/runtime contracts isolated)`
);
