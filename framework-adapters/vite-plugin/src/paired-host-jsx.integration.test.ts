import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { build } from 'vite';
import { compileProjectArtifacts, createExactArtifactPlan } from '@exactjs/compiler';
import {
	componentInputRecipe,
	redeemComponentInput
} from '@exactjs/core/runtime/component-operations';
import { componentContractVersion } from '../../../packages/compiler/src/native/contract-versions.js';
import { createCompilerTestWorkspace } from '../../../packages/compiler/src/test-support/workspace.js';
import { exact } from './index.js';

it('bundles package exports through the planned facade and its source-mapped host JSX module', async () => {
	const root = await createCompilerTestWorkspace('.exact-paired-host-', process.cwd()),
		kit = path.join(root, 'kit');
	const input = path.join(kit, 'List.tsx'),
		outDir = path.join(kit, 'dist');
	await mkdir(kit, { recursive: true });
	const component =
		'export default function List(props:{label:string}){return()=> <div>{props.label}</div>}';
	const source = component + '\nexport const view=()=> <List label="host"/>;';
	await writeFile(input, source);
	const options = { rootDir: kit, outDir, sourceMap: true };
	const plan = await createExactArtifactPlan([input], options);
	const [pair] = await compileProjectArtifacts([input], options);
	const pkg = path.join(root, 'node_modules/@fixture');
	await mkdir(pkg, { recursive: true });
	await symlink(kit, path.join(pkg, 'paired-list'), 'junction');
	for (const target of ['client', 'server'] as const) {
		const planned = target === 'client' ? plan.entries[0]!.clientFile : plan.entries[0]!.serverFile;
		expect(target === 'client' ? pair!.clientFile : pair!.serverFile).toBe(planned);
		const mapFile = target === 'client' ? pair!.clientMapFile! : pair!.serverMapFile!;
		const map = JSON.parse(await readFile(mapFile, 'utf8'));
		const implementation = path.join(path.dirname(mapFile), map.file);
		expect(path.extname(implementation)).toBe('.tsx');
		expect(map.sourcesContent).toContain(source);
		expect(await readFile(implementation, 'utf8')).toContain(
			'sourceMappingURL=' + path.basename(mapFile)
		);
		const packageTarget = (file: string) =>
			'./' + path.relative(kit, file).split(path.sep).join('/');
		await writeFile(
			path.join(kit, 'package.json'),
			JSON.stringify({
				name: '@fixture/paired-list',
				type: 'module',
				exports: { '.': packageTarget(planned), './implementation': packageTarget(implementation) }
			})
		);
		const consumer = path.join(root, 'consumer.ts');
		await writeFile(
			consumer,
			"export { default as List, view } from '@fixture/paired-list';export { default as direct, view as directView } from '@fixture/paired-list/implementation';"
		);
		const bundle = path.join(root, 'bundle-' + target);
		await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [exact({ applicationRoot: root, target, reactCompatibility: false })],
			oxc: { jsx: { runtime: 'automatic', importSource: '@exactjs/jsx' } },
			build: {
				outDir: bundle,
				ssr: target === 'server' ? consumer : false,
				minify: false,
				lib: { entry: consumer, formats: ['es'], fileName: () => 'consumer.mjs' },
				rollupOptions: {
					input: consumer,
					external: (id: string) => id.startsWith('@exactjs/'),
					output: { entryFileNames: 'consumer.mjs' }
				}
			}
		});
		const module = await import(pathToFileURL(path.join(bundle, 'consumer.mjs')).href);
		expect(typeof module.List).toBe('function');
		expect(module.List).toBe(module.direct);
		expect(module.view).toBe(module.directView);
		const provider = { version: componentContractVersion, target };
		const recipe = componentInputRecipe(redeemComponentInput(module.view(), provider), provider);
		expect(recipe.props.label).toBe('host');
	}
	const previous = pair!.clientMapFile!;
	await writeFile(input, component);
	const [simple] = await compileProjectArtifacts([input], options);
	expect(simple!.clientFile).toBe(pair!.clientFile);
	expect(await readFile(simple!.clientFile, 'utf8')).toContain('export default');
	await expect(readFile(previous)).rejects.toMatchObject({ code: 'ENOENT' });
}, 30000);
