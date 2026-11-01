import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { buildLibrary } from './library-build.js';
import type { ExactPublishedComponentBuildFacts } from './contracts/transform.js';
import { createLibraryBuildFilesFixture } from './test-support/library-build-files.fixture.js';

it('publishes an unknown public alias and its inspected direct relative component without claiming portability', async () => {
	const { root, manifest, json } = await createLibraryBuildFilesFixture(onTestFinished);
	await json('package.json', { ...manifest, exactCompiledComponents: ['PublicExample'] });
	const sources = {
		'index.ts': "export {Example as PublicExample} from './Example.js';",
		'Example.tsx':
			"import {Child} from './Child.js'; declare const helper:{read():string}; export function Example(){const value=helper.read();return()=> <Child label={value}/>;}",
		'Child.tsx':
			'declare const helper:{read():string};export function Child(props:{label:string}){const value=helper.read();return()=> <p>{props.label}{value}</p>;}'
	};
	for (const [name, source] of Object.entries(sources))
		await writeFile(path.join(root, 'src', name), source);
	// Durable regressions own temporary workspaces. Raw capture is optional and caller-owned.
	const capture = process.env.EXACT_LIBRARY_SELECTION_EVIDENCE_DIR;
	let evidence: string | undefined;
	if (capture) {
		const evidenceRoot = path.resolve(capture);
		await mkdir(evidenceRoot, { recursive: true });
		evidence = await mkdtemp(path.join(evidenceRoot, 'attempt-'));
		await writeFile(
			path.join(evidence, 'authored.json'),
			JSON.stringify(
				{
					root,
					sources,
					manifest: { ...manifest, exactCompiledComponents: ['PublicExample'] },
					config: JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8')),
					executable: process.env.EXACT_COMPILER_EXECUTABLE
				},
				null,
				2
			)
		);
	}
	await buildLibrary({ root });
	const raw = await readFile(path.join(root, 'dist/exact-component-build.json'), 'utf8');
	const facts = JSON.parse(raw) as ExactPublishedComponentBuildFacts;
	if (evidence) {
		await cp(path.join(root, 'dist'), path.join(evidence, 'dist'), { recursive: true });
		await writeFile(path.join(evidence, 'published.json'), raw);
	}
	for (const target of ['client', 'server'] as const) {
		const exported = facts.exports.find((entry) => entry.target === target)!;
		expect(exported).toMatchObject({
			exportName: 'PublicExample',
			componentModule: `dist/${target}/Example.js`
		});
		const owner = facts.modules.find((module) => module.path === exported.componentModule)!;
		expect(owner.facts.components).toContainEqual({
			id: exported.componentId,
			placement: 'unknown',
			artifactTargets: []
		});
		const edge = owner.facts.componentImports.find((entry) => entry.exportName === 'Child')!;
		expect(edge.executable).toEqual({ target, module: `dist/${target}/Child.js` });
		expect(edge.artifactTargets).toEqual([]);
		expect(
			facts.modules.find((module) => module.path === edge.executable!.module)!.facts.components
		).toContainEqual({ id: edge.canonicalComponentId, placement: 'unknown', artifactTargets: [] });
	}
	// A final namespace-inspection failure must not replace the previous paired generation.
	const before = await readFile(path.join(root, 'dist/client/index.js'), 'utf8');
	await writeFile(path.join(root, 'src/index.ts'), 'export const PublicExample=1;');
	await expect(buildLibrary({ root })).rejects.toThrow(/compiled component artifact/);
	expect(await readFile(path.join(root, 'dist/client/index.js'), 'utf8')).toBe(before);
	expect(await readFile(path.join(root, 'dist/exact-component-build.json'), 'utf8')).toBe(raw);
}, 30_000);
