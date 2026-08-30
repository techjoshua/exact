import { transform as transpile } from 'esbuild';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, onTestFinished } from 'vitest';
import { compileFileArtifacts } from './index.js';

const execFileAsync = promisify(execFile);
// Subprocess packing and installation are substantially slower while V8
// coverage is collecting every compiler source file.
const packageArtifactTimeout = process.env.EXACT_COVERAGE ? 60_000 : 30_000;

describe('installed eXact component package artifacts', () => {
	it(
		'uses one packed package in client, SSR, and server-component builds',
		async () => {
			const root = await mkdtemp(path.join(process.cwd(), '.exact-package-fixture-'));
			onTestFinished(() => rm(root, { recursive: true, force: true }));
			const packageRoot = path.join(root, 'package');
			const leafRoot = path.join(packageRoot, 'node_modules', '@fixture', 'exact-leaf');
			const leafSourceRoot = path.join(root, 'leaf-source');
			const leafGeneratedRoot = path.join(root, 'leaf-generated');
			await mkdir(leafSourceRoot, { recursive: true });
			const leafSource = path.join(leafSourceRoot, 'leaf.tsx');
			await writeFile(
				leafSource,
				`export function Leaf() { return () => <small data-leaf="compiled">leaf</small>; }\n`
			);
			const leafCompiled = await compileFileArtifacts(leafSource, {
				outDir: leafGeneratedRoot,
				rootDir: leafSourceRoot,
				packageType: 'library',
				packageName: '@fixture/exact-leaf'
			});
			const leafComponentId = leafCompiled.build.componentBuild.components[0]?.id;
			if (!leafComponentId) throw new Error('Nested package fixture omitted its component fact');
			await mkdir(leafRoot, { recursive: true });
			await writeFile(
				path.join(leafRoot, 'index.client.js'),
				(
					await transpile(await readFile(leafCompiled.clientFile, 'utf8'), {
						loader: 'ts',
						format: 'esm',
						target: 'es2022'
					})
				).code
			);
			await writeFile(
				path.join(leafRoot, 'index.server.js'),
				(
					await transpile(await readFile(leafCompiled.serverFile, 'utf8'), {
						loader: 'ts',
						format: 'esm',
						target: 'es2022'
					})
				).code
			);
			await writeFile(
				path.join(leafRoot, 'index.d.ts'),
				'export declare function Leaf(this: unknown): () => unknown;\n'
			);
			await writeFile(
				path.join(leafRoot, 'exact-component-build.json'),
				`${JSON.stringify({
					protocol: 2,
					package: { name: '@fixture/exact-leaf', version: '1.0.0' },
					modules: [
						{ path: 'index.client.js', facts: leafCompiled.build.componentBuild },
						{ path: 'index.server.js', facts: leafCompiled.build.componentBuild }
					],
					exports: [
						{
							subpath: '.',
							condition: 'exact-client',
							module: 'index.client.js',
							componentModule: 'index.client.js',
							exportName: 'Leaf',
							componentId: leafComponentId
						},
						{
							subpath: '.',
							condition: 'exact-server',
							module: 'index.server.js',
							componentModule: 'index.server.js',
							exportName: 'Leaf',
							componentId: leafComponentId
						}
					]
				})}\n`
			);
			await writeFile(
				path.join(leafRoot, 'package.json'),
				`${JSON.stringify({
					name: '@fixture/exact-leaf',
					version: '1.0.0',
					type: 'module',
					exactComponentLibrary: { protocol: 2, build: './exact-component-build.json' },
					exports: {
						'.': {
							types: './index.d.ts',
							'exact-client': './index.client.js',
							'react-server': './index.server.js',
							'exact-server': './index.server.js',
							default: './index.client.js'
						}
					}
				})}\n`
			);
			const sourceRoot = path.join(packageRoot, 'src');
			const generatedRoot = path.join(packageRoot, 'generated');
			await mkdir(sourceRoot, { recursive: true });
			const source = path.join(sourceRoot, 'widget.tsx');
			await writeFile(
				source,
				`
		import { Leaf } from '@fixture/exact-leaf';
      export function Widget(this: Component<{}>) {
        window.location.href;
				return () => <section><Leaf /></section>;
      }
    `
			);
			const compiled = await compileFileArtifacts(source, {
				outDir: generatedRoot,
				rootDir: sourceRoot,
				packageType: 'library',
				packageName: '@fixture/exact-components'
			});
			const componentId = compiled.build.componentBuild.components[0]?.id;
			if (!componentId) throw new Error('Package fixture did not produce a component build fact');
			const clientJs = path.join(packageRoot, 'widget.client.js');
			const serverJs = path.join(packageRoot, 'widget.server.js');
			await writeFile(
				clientJs,
				(
					await transpile(await readFile(compiled.clientFile, 'utf8'), {
						loader: 'ts',
						format: 'esm',
						target: 'es2022'
					})
				).code
			);
			await writeFile(
				serverJs,
				(
					await transpile(await readFile(compiled.serverFile, 'utf8'), {
						loader: 'ts',
						format: 'esm',
						target: 'es2022'
					})
				).code
			);
			await writeFile(
				path.join(packageRoot, 'index.client.js'),
				`export { Widget } from "./widget.client.js";\n`
			);
			await writeFile(
				path.join(packageRoot, 'index.server.js'),
				`export { Widget } from "./widget.server.js";\n`
			);
			await writeFile(
				path.join(packageRoot, 'index.d.ts'),
				`export declare function Widget(this: unknown): () => null;\n`
			);
			await writeFile(
				path.join(packageRoot, 'exact-component-build.json'),
				`${JSON.stringify(
					{
						protocol: 2,
						package: { name: '@fixture/exact-components', version: '1.0.0' },
						modules: [
							{
								path: 'widget.client.js',
								facts: compiled.build.componentBuild
							},
							{
								path: 'widget.server.js',
								facts: compiled.build.componentBuild
							}
						],
						exports: [
							{
								subpath: '.',
								condition: 'exact-client',
								module: 'index.client.js',
								componentModule: 'widget.client.js',
								exportName: 'Widget',
								componentId
							},
							{
								subpath: '.',
								condition: 'exact-server',
								module: 'index.server.js',
								componentModule: 'widget.server.js',
								exportName: 'Widget',
								componentId
							}
						]
					},
					null,
					2
				)}\n`
			);
			await writeFile(
				path.join(packageRoot, 'package.json'),
				`${JSON.stringify(
					{
						name: '@fixture/exact-components',
						version: '1.0.0',
						type: 'module',
						dependencies: { '@fixture/exact-leaf': '1.0.0' },
						bundledDependencies: ['@fixture/exact-leaf'],
						sideEffects: false,
						files: [
							'index.client.js',
							'index.server.js',
							'index.d.ts',
							'widget.client.js',
							'widget.server.js',
							'exact-component-build.json'
						],
						exactComponentLibrary: {
							protocol: 2,
							build: './exact-component-build.json'
						},
						exports: {
							'.': {
								types: './index.d.ts',
								'exact-client': './index.client.js',
								'react-server': './index.server.js',
								'exact-server': './index.server.js',
								default: './index.client.js'
							}
						}
					},
					null,
					2
				)}\n`
			);

			const npm = process.env.npm_execpath
				? { command: process.execPath, prefix: [process.env.npm_execpath] }
				: { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', prefix: [] };
			const npmEnvironment = {
				...process.env,
				npm_config_cache: path.join(root, 'npm-cache')
			};
			const packed = await execFileAsync(
				npm.command,
				[
					...npm.prefix,
					'pack',
					'--json',
					'--cache',
					path.join(root, 'npm-cache'),
					'--pack-destination',
					root
				],
				{
					cwd: packageRoot,
					env: npmEnvironment
				}
			);
			const packResult = (
				JSON.parse(packed.stdout) as Array<{
					filename: string;
					files: Array<{ path: string }>;
				}>
			)[0]!;
			const packedFiles = packResult.files.map((file) => file.path);
			expect(packedFiles).toContain('exact-component-build.json');
			expect(packedFiles).toContain('node_modules/@fixture/exact-leaf/index.client.js');
			expect(packedFiles).toContain('node_modules/@fixture/exact-leaf/exact-component-build.json');
			expect(packedFiles).not.toContainEqual(expect.stringMatching(/(?:^|\/)src\//));
			expect(packedFiles.filter((file) => !file.endsWith('.d.ts'))).not.toContainEqual(
				expect.stringMatching(/\.tsx?$/)
			);
			const tarballName = packResult.filename;
			const tarball = path.join(root, tarballName);
			const consumer = path.join(root, 'consumer');
			await mkdir(consumer);
			await writeFile(
				path.join(consumer, 'package.json'),
				`${JSON.stringify(
					{
						name: 'exact-package-consumer',
						private: true,
						type: 'module'
					},
					null,
					2
				)}\n`
			);
			await execFileAsync(
				npm.command,
				[
					...npm.prefix,
					'install',
					'--ignore-scripts',
					'--no-package-lock',
					'--no-audit',
					'--no-fund',
					'--cache',
					path.join(root, 'npm-cache'),
					tarball
				],
				{
					cwd: consumer,
					env: npmEnvironment
				}
			);
			const exactCore = path.join(consumer, 'node_modules', '@exactjs', 'core');
			await mkdir(exactCore, { recursive: true });
			await writeFile(
				path.join(exactCore, 'package.json'),
				`${JSON.stringify({
					name: '@exactjs/core',
					version: '0.0.0-fixture',
					type: 'module',
					exports: {
						'.': './index.js',
						'./framework/render-structure': './index.js',
						'./framework/server-render-structure': './index.js',
						'./framework/server-task-helpers': './index.js',
						'./runtime/component-abi': './index.js',
						'./runtime/component-operations': './index.js',
						'./runtime/render': './index.js',
						'./runtime/render-operations': './index.js',
						'./runtime/component-construction/render': './index.js',
						'./runtime/component-construction/task': './index.js',
						'./runtime/component-construction/durable': './index.js',
						'./runtime/component-construction/direct-server': './index.js',
						'./runtime/reactivity': './index.js',
						'./runtime/tasks': './index.js',
						'./runtime/inspection': './index.js',
						'./runtime/registry': './index.js',
						'./runtime/enhancements': './index.js'
					}
				})}\n`
			);
			await writeFile(
				path.join(exactCore, 'index.js'),
				`
      export function createServerBoundary() { return null; }
			export function createCompiledComponentReceipt(type, props, ...children) { return { type, props: props ?? {}, children }; }
			export function createCompiledIntrinsicReceipt(type, props, ...children) { return { type, props: props ?? {}, children }; }
			export function createServerBoundaryReceipt(id, name, props, ...children) { return { id, name, props, children }; }
			export function createServerSlotReceipt(id, authority, ...children) { return { id, authority, children }; }
			export function createPreparedRenderProgram() { return {}; }
			export function prepareCompiledRenderProgram() { return {}; }
			export function constructRenderComponentInstance() { return null; }
			export class RenderComponentInstance {}
			export function constructTaskComponentInstance() { return null; }
			export class TaskComponentInstance {}
			export function constructDurableComponentInstance() { return null; }
			export class ComponentInstanceImpl {}
			export function rejectDirectServerComponentConstruction() { return null; }
			export function attachExactClientComponent() { return {}; }
			export function attachExactCompiledClientComponent() { return {}; }
			export function receiveExactClientComponentProps() {}
			export function disposeExactClientComponent() {}
			export function issueExactServerComponent() { return {}; }
			export function writeExactServerComponent() {}
			export function disposeExactServerComponent() {}
    `
			);
			await writeFile(
				path.join(consumer, 'package-lock.json'),
				`${JSON.stringify(
					{
						name: 'exact-package-consumer',
						lockfileVersion: 3,
						packages: {
							'': { name: 'exact-package-consumer' },
							'node_modules/@fixture/exact-components': {
								version: '1.0.0',
								integrity: 'sha512-fixture-lock-integrity'
							}
						}
					},
					null,
					2
				)}\n`
			);

			const consumerSource = path.join(consumer, 'app.tsx');
			await writeFile(
				consumerSource,
				`
      import { Widget } from "@fixture/exact-components";
      export function App() {
        return () => <main><Widget /></main>;
      }
    `
			);
			const consumerArtifacts = await compileFileArtifacts(consumerSource, {
				outDir: path.join(consumer, 'dist'),
				rootDir: consumer,
				packageType: 'application',
				packageName: 'exact-package-consumer',
				serverComponents: true
			});
			expect(await readFile(consumerArtifacts.serverFile, 'utf8')).toContain('Widget');

			const client = await loadConsumer(consumer, 'exact-client');
			const ssr = await loadConsumer(consumer, 'exact-server');
			const serverComponent = await loadConsumer(consumer, 'react-server');

			expect(client.symbols).toContain('@exactjs/component-contract');
			expect(client.source).toContain('window.location.href');
			expect(ssr.source).toContain('__exactBoundary');
			expect(ssr.source).not.toContain('window.location.href');
			expect(serverComponent).toEqual(ssr);
			const installedLeafRoot = path.join(
				consumer,
				'node_modules',
				'@fixture',
				'exact-components',
				'node_modules',
				'@fixture',
				'exact-leaf'
			);
			expect(await readFile(path.join(installedLeafRoot, 'index.client.js'), 'utf8')).toContain(
				'Leaf'
			);
			expect(
				JSON.parse(
					await readFile(path.join(installedLeafRoot, 'exact-component-build.json'), 'utf8')
				)
			).toMatchObject({ protocol: 2, package: { name: '@fixture/exact-leaf' } });
			const installedFacts = JSON.parse(
				await readFile(
					path.join(
						consumer,
						'node_modules',
						'@fixture',
						'exact-components',
						'exact-component-build.json'
					),
					'utf8'
				)
			) as { protocol: number; modules: Array<{ facts: unknown }> };
			expect(installedFacts.protocol).toBe(2);
			expect(installedFacts.modules).toHaveLength(2);
			expect(JSON.stringify(installedFacts)).not.toMatch(/window\.location|function\s*\(|=>/);
		},
		packageArtifactTimeout
	);
});

async function loadConsumer(
	consumer: string,
	condition: string
): Promise<{ source: string; symbols: Array<string | undefined> }> {
	const loaded = await execFileAsync(
		process.execPath,
		[
			`--conditions=${condition}`,
			'--input-type=module',
			'--eval',
			`import { Widget } from "@fixture/exact-components";
			console.log(JSON.stringify({
				source: String(Widget),
				symbols: Object.getOwnPropertySymbols(Widget).map(Symbol.keyFor)
			}));`
		],
		{ cwd: consumer }
	);
	return JSON.parse(loaded.stdout) as {
		source: string;
		symbols: Array<string | undefined>;
	};
}
