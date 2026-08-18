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
for (const statement of sourceFile.statements)
	if (ts.isExportDeclaration(statement) && statement.moduleSpecifier)
		exportedModules.add(statement.moduleSpecifier.text);
const missing = [...exportedModules].filter((module) => !classified.has(module));
const stale = [...classified].filter(([module]) => !exportedModules.has(module));
if (missing.length || stale.length)
	throw new Error(
		`Core API ownership mismatch:${missing.map((module) => `\n- unclassified ${module}`).join('')}${stale.map(([module]) => `\n- stale ${module}`).join('')}`
	);
console.log(`core API ownership ok (${exportedModules.size} modules classified)`);
