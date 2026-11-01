import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { createCompilerSession } from '../expression/session.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { compileProjectArtifacts } from './artifact-compilation.js';
import { collectPlacementAnalysisDependencies } from './dependency-discovery.js';

it('links declaration-backed event implementations from relocated paired artifacts', async () => {
	const root = await createCompilerTestWorkspace('.exact-declaration-runtime-', process.cwd());
	const input = path.join(root, 'input');
	const output = path.join(root, 'output');
	await mkdir(input);
	const fixtures = path.resolve(
		import.meta.dirname,
		'../../../component-composition-corpus/src/test-support'
	);
	for (const name of [
		'event-argument-ownership.fixtures.tsx',
		'event-function-declaration.js',
		'event-function-declaration.d.ts'
	])
		await writeFile(path.join(input, name), await readFile(path.join(fixtures, name)));
	const entry = path.join(input, 'entry.tsx');
	await writeFile(
		entry,
		`
export * from './event-argument-ownership.fixtures.js';
export {handlerReceipt,reassignedHandler} from './event-function-declaration.js';
export * as second from './second.js';`
	);
	await writeFile(
		path.join(input, 'second.ts'),
		"export {handlerReceipt,reassignedHandler} from './event-function-declaration.js';"
	);
	const fixture = path.join(input, 'event-argument-ownership.fixtures.tsx');
	const source = await readFile(fixture, 'utf8');
	const session = createCompilerSession();
	try {
		const native = session.compileNative({ id: fixture, kind: 'analyze', source });
		expect(
			native.analysis.imports.find(
				(edge) => edge.moduleSpecifier === './event-function-declaration.js'
			)
		).toMatchObject({
			resolvedFile: path.join(input, 'event-function-declaration.d.ts'),
			typeOnly: false,
			runtimeBinding: true
		});
		const dependencies = await collectPlacementAnalysisDependencies(
			new Map([[fixture, source]]),
			session
		);
		expect(dependencies.graph.get(fixture)).toContain(
			path.join(input, 'event-function-declaration.js')
		);
		const artifacts = await compileProjectArtifacts([entry], {
			rootDir: input,
			outDir: output,
			session
		});
		const artifact = artifacts.find((value) => value.inputFile === entry)!;
		for (const target of ['client', 'server'] as const) {
			const bundleFile = path.join(root, target + '.mjs');
			const bundle = await build({
				entryPoints: [artifact[(target + 'File') as 'clientFile' | 'serverFile']],
				outfile: bundleFile,
				bundle: true,
				write: false,
				metafile: true,
				platform: 'node',
				format: 'esm',
				packages: 'external'
			});
			expect(
				Object.keys(bundle.metafile!.inputs).filter((file) =>
					file.endsWith('/event-function-declaration.js')
				)
			).toHaveLength(1);
			await writeFile(bundleFile, bundle.outputFiles![0]!.contents);
			const module = await import(pathToFileURL(bundleFile).href);
			expect(module.second.handlerReceipt).toBe(module.handlerReceipt);
			expect(module.second.reassignedHandler).toBe(module.reassignedHandler);
			expect(module.reassignedHandler.length).toBe(1);
			const events: string[] = [];
			module.handlerReceipt.current = (event: { type: string }) => events.push(event.type);
			Reflect.apply(module.reassignedHandler, undefined, [{ type: 'click' }]);
			Reflect.apply(module.second.reassignedHandler, undefined, [{ type: 'change' }]);
			expect(events).toEqual(['click', 'change']);
			expect(Object.keys(module).sort()).toEqual(
				[
					'MutableEventHandlers',
					'deliveredEvent',
					'handlerReceipt',
					'mutableHandlerRoot',
					'reassignedHandler',
					'replaceMutableHandler',
					'second',
					...(target === 'server' ? ['MutableEventHandlers_ExactServer_1'] : [])
				].sort()
			);
		}
	} finally {
		session.dispose();
	}
}, 60000);
