import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { compileProjectArtifacts } from './artifact-compilation.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { expect, it } from 'vitest';
import { transformSource } from './transformation.js';
import {
	readExactArtifactComponentFacts,
	retainArtifactComponentFacts
} from './artifact-component-facts.js';

it('retains relocated importer facts without changing executable mappings', () => {
	const original = transformSource(
		`import { Card } from './Card.js'; export function Page() { return () => <Card />; }`,
		{ filename: '/source/Page.tsx', target: 'server', sourceMap: true }
	);
	const linked = retainArtifactComponentFacts(original, {
		moduleAliases: { './Card.js': './Card.exact.server.js' }
	});
	expect(linked.map).toBe(original.map);
	expect(linked.code.startsWith(original.code)).toBe(true);
	const facts = readExactArtifactComponentFacts(linked.code, '/consumer/Page.exact.server.ts');
	expect(facts?.filename).toBe('/consumer/Page.exact.server.ts');
	expect(facts?.componentImports).toEqual([
		expect.objectContaining({
			moduleSpecifier: './Card.exact.server.js',
			exportName: 'Card',
			artifactTargets: expect.arrayContaining(['server'])
		})
	]);
	const replaced = retainArtifactComponentFacts(original, {
		replacements: [
			{
				sourceModule: './Card.js',
				sourceExport: 'Card',
				targetModule: '@ui/card',
				targetExport: 'DefaultCard'
			}
		]
	});
	expect(
		readExactArtifactComponentFacts(replaced.code, '/consumer/page.ts')?.componentImports[0]
	).toMatchObject({ moduleSpecifier: '@ui/card', exportName: 'DefaultCard' });
});

it('rejects malformed and duplicate marked facts while ignoring ordinary source', () => {
	expect(readExactArtifactComponentFacts('export const value = 1;', '/app.ts')).toBeUndefined();
	const marker = '// exact:component-build/1 ';
	expect(() =>
		readExactArtifactComponentFacts('// exact:component-build/2 abc', '/app.ts')
	).toThrow(/Unsupported/);
	for (const value of [
		null,
		{ protocol: 2 },
		{
			protocol: 1,
			components: [{ id: 'bad', placement: 'portable', artifactTargets: [] }],
			componentImports: [],
			rendererEnhancements: []
		},
		{
			protocol: 1,
			components: [{ id: 'bad', placement: 'unknown', artifactTargets: ['browser'] }],
			componentImports: [],
			rendererEnhancements: []
		},
		{ protocol: 1, components: [], componentImports: [{}], rendererEnhancements: [] }
	]) {
		expect(() =>
			readExactArtifactComponentFacts(
				marker + Buffer.from(JSON.stringify(value)).toString('base64url'),
				'/app.ts'
			)
		).toThrow(/Invalid artifact/);
	}
	expect(() => readExactArtifactComponentFacts(marker + '!invalid', '/app.ts')).toThrow(
		/Malformed/
	);
	expect(() => readExactArtifactComponentFacts(marker + 'a\n' + marker + 'b', '/app.ts')).toThrow(
		/Duplicate/
	);
});

it('preserves producer facts through a test-owned bundle without analyzing its lowered source', async () => {
	const root = await createCompilerTestWorkspace('.exact-bundle-facts-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		path.join(root, 'child.tsx'),
		'export function Card(){return()=> <button>Card</button>;}'
	);
	await writeFile(
		entry,
		"import {Card} from './child.js';export function Page(){return()=> <main><Card/></main>;}"
	);
	const artifacts = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const artifact = artifacts.find((value) => value.inputFile === entry)!;
	const before = readExactArtifactComponentFacts(
		await readFile(artifact.serverFile, 'utf8'),
		artifact.serverFile
	);
	expect(before?.componentImports.length).toBeGreaterThan(0);
	const bundle = path.join(root, 'server.mjs');
	const namespace = await importArtifact(artifact.serverFile, bundle);
	expect(typeof namespace.Page).toBe('function');
	const after = readExactArtifactComponentFacts(await readFile(bundle, 'utf8'), bundle);
	expect(after).toEqual({ ...before, filename: bundle });
});

it('retains compiler uncertainty as descriptive facts without supplying target authority', () => {
	const result = transformSource(
		`import {Card} from './Card.js';declare function dynamic():string;export function Page(){const value=dynamic();return()=> <Card value={value}/>;}`,
		{ filename: '/source/uncertain.tsx', target: 'server' }
	);
	const source = retainArtifactComponentFacts(result).code;
	const facts = readExactArtifactComponentFacts(source, '/consumer/uncertain.ts');
	expect(facts?.components).toContainEqual(
		expect.objectContaining({ placement: 'unknown', artifactTargets: [] })
	);
	expect(facts?.componentImports).toContainEqual(
		expect.objectContaining({ moduleSpecifier: './Card.js', artifactTargets: [] })
	);
});
