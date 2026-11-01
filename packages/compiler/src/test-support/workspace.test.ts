import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, expect, it } from 'vitest';
import { createCompilerTestWorkspace, createTestWorkspace, repositoryPath } from './workspace.js';

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) expect(existsSync(root)).toBe(false);
});

function project(root: string): ts.ParsedCommandLine {
	const filename = path.join(root, 'tsconfig.json');
	const config = ts.readConfigFile(filename, ts.sys.readFile);
	expect(config.error).toBeUndefined();
	return ts.parseJsonConfigFileContent(config.config, ts.sys, root);
}

it('owns requested sources while retaining enclosing options and imported dependencies', async () => {
	const parent = await createTestWorkspace('exact-fixture-options-');
	roots.push(parent);
	await writeFile(path.join(parent, 'unrelated.ts'), "const unrelated: number = 'invalid';");
	await writeFile(
		path.join(parent, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				strict: true,
				target: 'ES2022',
				module: 'NodeNext',
				types: [],
				skipLibCheck: true
			},
			include: ['*.ts']
		})
	);
	const root = await createCompilerTestWorkspace('entry-', parent);
	roots.push(root);
	const entry = path.join(root, 'entry.ts');
	const dependency = path.join(root, 'dependency.ts');
	await writeFile(
		entry,
		"import {value} from './dependency.js';export const result: number = value;"
	);
	await writeFile(dependency, 'export const value: number = 1;');
	const config = project(root);
	expect(config.fileNames).toEqual([]);
	expect(config.options.strict).toBe(true);
	expect(config.options.target).toBe(ts.ScriptTarget.ES2022);
	expect(config.options.module).toBe(ts.ModuleKind.NodeNext);
	const program = () => ts.createProgram([entry], config.options);
	const valid = program();
	expect(valid.getSourceFile(dependency)).toBeDefined();
	expect(valid.getSourceFile(path.join(parent, 'unrelated.ts'))).toBeUndefined();
	expect(ts.getPreEmitDiagnostics(valid)).toEqual([]);
	await writeFile(dependency, "export const value: number = 'invalid';");
	expect(ts.getPreEmitDiagnostics(program())).toContainEqual(
		expect.objectContaining({ code: 2322, file: expect.objectContaining({ fileName: dependency }) })
	);
});

it('preserves explicitly owned whole-project and ambient roots', async () => {
	const root = await createTestWorkspace('exact-fixture-ambient-');
	roots.push(root);
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: { strict: true, types: [], target: 'ES2022', skipLibCheck: true },
			include: ['*.ts']
		})
	);
	const entry = path.join(root, 'entry.ts');
	const ambient = path.join(root, 'ambient.d.ts');
	await writeFile(ambient, 'declare const fixtureValue: number;');
	await writeFile(entry, 'const result: number = fixtureValue;');
	const config = project(root);
	expect(config.fileNames).toEqual(expect.arrayContaining([entry, ambient]));
	expect(ts.getPreEmitDiagnostics(ts.createProgram(config.fileNames, config.options))).toEqual([]);
	await writeFile(entry, 'const result: string = fixtureValue;');
	expect(
		ts.getPreEmitDiagnostics(ts.createProgram(config.fileNames, config.options))
	).toContainEqual(
		expect.objectContaining({ code: 2322, file: expect.objectContaining({ fileName: entry }) })
	);
});

it('uses the compiler environment for an external fixture without a project ancestor', async () => {
	const root = await createCompilerTestWorkspace('exact-fixture-standalone-');
	roots.push(root);
	const config = JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8'));
	expect(config.extends).toBe(repositoryPath('packages/compiler/tsconfig.json'));
	expect(project(root).fileNames).toEqual([]);
});

it('keeps the compiler fixture environment when tests run from the repository solution root', async () => {
	const root = await createCompilerTestWorkspace('.exact-fixture-root-options-', repositoryPath());
	roots.push(root);
	const config = project(root);
	expect(config.fileNames).toEqual([]);
	expect(config.options.strict).toBe(true);
	expect(config.options.lib).toEqual(['lib.es2022.d.ts']);
	expect(config.options.types).toEqual(['node']);
	expect(config.options.module).toBe(ts.ModuleKind.NodeNext);
});
