import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { build as esbuild, type Plugin } from 'esbuild';
import { createTestWorkspace } from './test-support/workspace.js';
import {
	analyzeSource,
	analyzeSemanticGraph,
	assertExactArtifactTarget,
	createClientIslandRegistryEntries,
	createClientIslandRegistryModule,
	createExactArtifactDevState,
	createExactArtifactGraph,
	createExactArtifactPlan,
	createExactArtifactRegistryModules,
	createExactHydrationRegistrationModule,
	createServerPartRegistryModule,
	compileArtifactPlanEntries,
	compileFile,
	compileFileArtifacts,
	compileProject,
	compileProjectArtifacts,
	createPackageExportMap,
	createServerPartRegistryEntries,
	diffExactArtifactPlans,
	exactExportConditions,
	exactCompilerManifestVersion,
	generatedComponentName,
	parseExactCompilerManifest,
	preprocessPropPunning,
	readExactArtifactManifestEntries,
	resolveExactArtifactImport,
	transform,
	transformSource,
	updateExactArtifactDevState
} from './index.js';

describe('@exact/compiler: artifacts', () => {
	it('compiles a single TSX file to an output directory', async () => {
		const root = await createTestWorkspace('exact-compiler-');
		const input = path.join(root, 'src', 'view.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(input, 'const view = <span />;');

		const result = await compileFile(input, { outDir, rootDir: path.join(root, 'src') });
		const output = await readFile(result.outputFile!, 'utf8');

		expect(result.outputFile).toBe(path.join(outDir, 'view.ts'));
		expect(output).toContain('__exactVNode("span"');
	});

	it('writes source maps beside compiled files', async () => {
		const root = await createTestWorkspace('exact-compiler-map-');
		const input = path.join(root, 'src', 'view.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(input, 'const view = <span />;');

		const result = await compileFile(input, {
			outDir,
			rootDir: path.join(root, 'src'),
			sourceMap: true
		});
		const output = await readFile(result.outputFile!, 'utf8');
		const map = JSON.parse(await readFile(result.sourceMapFile!, 'utf8'));

		expect(result.sourceMapFile).toBe(path.join(outDir, 'view.ts.map'));
		expect(output).toContain('//# sourceMappingURL=view.ts.map');
		expect(map.file).toBe('view.ts');
		expect(map.sources).toEqual([input]);
		expect(map.sourcesContent).toEqual(['const view = <span />;']);
	});

	it('can emit compiler manifests beside compiled files', async () => {
		const root = await createTestWorkspace('exact-manifest-');
		const input = path.join(root, 'src', 'page.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      import { readFile } from "node:fs/promises";
      function Page(this: Component<{ title?: string }>) {
        this.task(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        return () => <h1>{this.state.title}</h1>;
      }
    `
		);

		const result = await compileFile(input, {
			outDir,
			rootDir: path.join(root, 'src'),
			target: 'server',
			emitManifest: true
		});
		const manifest = JSON.parse(await readFile(result.manifestFile!, 'utf8'));

		expect(result.manifestFile).toBe(path.join(outDir, 'page.exact.json'));
		expect(Object.keys(manifest.serverActions)).toHaveLength(1);
		expect(manifest.components[0].name).toBe('Page');
	});

	it('emits paired client/server artifacts and a manifest', async () => {
		const root = await createTestWorkspace('exact-artifacts-');
		const input = path.join(root, 'src', 'components', 'page.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      import { readFile } from "node:fs/promises";
      export function Page(this: Component<{ title?: string; width?: number }>) {
        this.task.server(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        this.task.client(() => {
          this.state.width = window.innerWidth;
        });
        return () => <h1>{this.state.title}</h1>;
      }
    `
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const client = await readFile(result.clientFile, 'utf8');
		const server = await readFile(result.serverFile, 'utf8');
		const manifest = JSON.parse(await readFile(result.manifestFile, 'utf8'));

		expect(result.clientFile).toBe(path.join(outDir, 'components', 'page.exact.client.ts'));
		expect(result.serverFile).toBe(path.join(outDir, 'components', 'page.exact.server.ts'));
		expect(result.manifestFile).toBe(path.join(outDir, 'components', 'page.exact.manifest.json'));
		expect(client).not.toContain('node:fs/promises');
		expect(client).toContain('window.innerWidth');
		expect(client).toContain('export function Page');
		expect(server).toContain('node:fs/promises');
		expect(server).not.toContain('window.innerWidth');
		expect(server).toContain('export function Page');
		expect(Object.keys(manifest.serverActions)).toHaveLength(1);
		expect(manifest.exports).toEqual([
			{ name: 'Page', kind: 'component', placement: 'isomorphic' }
		]);
		expect(manifest.artifacts).toEqual({
			source: '../../src/components/page.tsx',
			client: 'page.exact.client.ts',
			server: 'page.exact.server.ts',
			manifest: 'page.exact.manifest.json',
			targets: {
				client: 'client',
				server: 'server'
			},
			exports: [
				{
					name: 'Page',
					kind: 'component',
					placement: 'isomorphic',
					artifactClass: 'dual'
				}
			],
			symbols: [
				expect.objectContaining({
					exportName: 'Page',
					localName: 'Page',
					generatedName: 'Page',
					role: 'root',
					target: 'server'
				})
			],
			boundaries: []
		});
	});

	it('writes source maps beside paired artifacts', async () => {
		const root = await createTestWorkspace('exact-artifacts-map-');
		const input = path.join(root, 'src', 'page.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(input, 'export function Page() { return () => <p />; }');

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src'),
			sourceMap: true
		});
		const client = await readFile(result.clientFile, 'utf8');
		const server = await readFile(result.serverFile, 'utf8');
		const clientMap = JSON.parse(await readFile(result.clientMapFile!, 'utf8'));
		const serverMap = JSON.parse(await readFile(result.serverMapFile!, 'utf8'));

		expect(result.clientMapFile).toBe(path.join(outDir, 'page.exact.client.ts.map'));
		expect(result.serverMapFile).toBe(path.join(outDir, 'page.exact.server.ts.map'));
		expect(client).toContain('//# sourceMappingURL=page.exact.client.ts.map');
		expect(server).toContain('//# sourceMappingURL=page.exact.server.ts.map');
		expect(clientMap.file).toBe('page.exact.client.ts');
		expect(serverMap.file).toBe('page.exact.server.ts');
		expect(clientMap.sources).toEqual([input]);
		expect(serverMap.sources).toEqual([input]);
	});

	it('creates package export maps for generated target artifacts', async () => {
		const root = await createTestWorkspace('exact-package-');
		const input = path.join(root, 'src', 'components', 'page.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(input, 'export function Page() { return () => <p />; }');

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});

		expect(
			createPackageExportMap([result], {
				packageRoot: root,
				sourceRoot: path.join(root, 'src'),
				typesRoot: path.join(root, 'dist')
			})
		).toEqual({
			'./components/page': {
				types: './dist/components/page.d.ts',
				'exact-client': './dist/components/page.exact.client.ts',
				'exact-server': './dist/components/page.exact.server.ts',
				default: './dist/components/page.exact.client.ts'
			}
		});
		expect(() => assertExactArtifactTarget(result, result.clientFile, 'server')).toThrow(
			'eXact server build resolved'
		);
		expect(() => assertExactArtifactTarget(result, result.serverFile, 'server')).not.toThrow();
	});

	it('extracts a closed target-neutral module into one shared artifact', async () => {
		const root = await createTestWorkspace('exact-shared-');
		const input = path.join(root, 'src', 'format.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      export function formatCurrency(value: number): string {
        return \`$\${value.toFixed(2)}\`;
      }
    `
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});

		expect(result.sharedFile).toBe(path.join(outDir, 'format.exact.shared.ts'));
		expect(await readFile(result.sharedFile!, 'utf8')).toContain('function formatCurrency');
		expect(await readFile(result.clientFile, 'utf8')).toBe(
			'export * from "./format.exact.shared.ts";\n'
		);
		expect(await readFile(result.serverFile, 'utf8')).toBe(
			'export * from "./format.exact.shared.ts";\n'
		);
		expect(result.manifest.artifacts).toMatchObject({
			shared: 'format.exact.shared.ts',
			targets: { client: 'client', server: 'server', shared: 'shared' },
			exports: [expect.objectContaining({ artifactClass: 'shared' })]
		});
	});

	it('attaches positional target descriptors to the public component function', async () => {
		const root = await createTestWorkspace('exact-descriptor-');
		const input = path.join(root, 'src', 'panel.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      export function Panel(this: Component<{ count: number }>) {
        this.task.server(() => { this.state.count = 1; });
        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
      }
    `
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const client = await readFile(result.clientFile, 'utf8');
		const server = await readFile(result.serverFile, 'utf8');
		const clientSymbol = result.manifest.symbols.find((symbol) => symbol.role === 'client-island')!;
		const serverSymbol = result.manifest.symbols.find((symbol) => symbol.role === 'server-part')!;

		expect(client).toContain('Symbol.for("@exact/client-component-descriptor")');
		expect(client).toContain(
			`["${clientSymbol.id}", "${clientSymbol.generatedName}", ${clientSymbol.exportName}]`
		);
		expect(client).toMatch(
			/export const Panel: typeof __exactImplementation_Panel_\d+ = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/
		);
		expect(server).toContain('Symbol.for("@exact/server-component-descriptor")');
		expect(server).toMatch(
			new RegExp(
				`\\["${serverSymbol.id}", "${serverSymbol.generatedName}", (?:${serverSymbol.localName}|__exactImplementation_Panel_\\d+)\\]`
			)
		);
		expect(server).toMatch(
			/export const Panel: typeof __exactImplementation_Panel_\d+ = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/
		);
		expect(client).not.toContain('parts:');
		expect(server).not.toContain('parts:');
		expect(result.manifest.artifacts?.exports).toContainEqual(
			expect.objectContaining({
				name: 'Panel',
				artifactClass: 'dual'
			})
		);
	});

	it('preserves hoisted component exports when project imports form a cycle', async () => {
		const root = await createTestWorkspace('exact-descriptor-cycle-');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		await mkdir(srcDir, { recursive: true });
		await writeFile(
			path.join(srcDir, 'a.tsx'),
			`
      import { observedName } from "./b";
      export function A(this: Component<{ count: number }>) {
        return () => <button onClick={() => this.state.count++}>{observedName}</button>;
      }
    `
		);
		await writeFile(
			path.join(srcDir, 'b.ts'),
			`
      import { A } from "./a";
      export const observedName = A.name;
    `
		);

		const results = await compileProjectArtifacts([srcDir], { outDir, rootDir: srcDir });
		const a = results.find((result) => path.basename(result.inputFile) === 'a.tsx')!;
		const client = await readFile(a.clientFile, 'utf8');
		const server = await readFile(a.serverFile, 'utf8');

		expect(client).toContain('export function A(');
		expect(client).toContain('Object.assign(A, {');
		expect(server).toContain('export function A(');
		expect(client).not.toContain('const __exactImplementation_A');
	});

	it('removes a stale shared artifact when a module becomes target-specific', async () => {
		const root = await createTestWorkspace('exact-shared-stale-');
		const input = path.join(root, 'src', 'value.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(input, `export function value() { return 1; }`);
		const initial = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		expect(initial.sharedFile).toBeDefined();
		expect(await readFile(initial.sharedFile!, 'utf8')).toContain('function value');

		await writeFile(
			input,
			`
      export function Value(this: Component<{ count: number }>) {
        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
      }
    `
		);
		const updated = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});

		expect(updated.sharedFile).toBeUndefined();
		await expect(readFile(initial.sharedFile!, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('keeps descriptor ids stable through minification and shakes unused components', async () => {
		const root = await createTestWorkspace('exact-descriptor-bundle-');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		const input = path.join(srcDir, 'components.tsx');
		await mkdir(srcDir, { recursive: true });
		await writeFile(
			input,
			`
      export function Used(this: Component<{ count: number }>) {
        this.state.count = window.innerWidth;
        return () => <button onClick={() => this.state.count++}>used</button>;
      }
      export function Unused(this: Component<{ count: number }>) {
        this.state.count = window.innerHeight;
        return () => <button onClick={() => this.state.count++}>unused</button>;
      }
    `
		);
		const result = await compileFileArtifacts(input, { outDir, rootDir: srcDir });
		const usedId = result.manifest.symbols.find(
			(symbol) =>
				symbol.target === 'client' && symbol.role === 'root' && symbol.debugName === 'Used'
		)!.id;
		const unusedId = result.manifest.symbols.find(
			(symbol) =>
				symbol.target === 'client' && symbol.role === 'root' && symbol.debugName === 'Unused'
		)!.id;
		const artifactCode = await readFile(result.clientFile, 'utf8');
		const descriptorPlugin: Plugin = {
			name: 'exact-descriptor-fixture',
			setup(build) {
				build.onResolve({ filter: /^exact-components$/ }, () => ({
					path: 'components',
					namespace: 'exact-fixture'
				}));
				build.onLoad({ filter: /.*/, namespace: 'exact-fixture' }, () => ({
					contents: artifactCode,
					loader: 'ts'
				}));
				build.onResolve({ filter: /.*/ }, (args) => ({ path: args.path, external: true }));
			}
		};

		const bundled = await esbuild({
			stdin: {
				contents: `import { Used } from "exact-components"; console.log(Used);`,
				loader: 'ts',
				sourcefile: 'entry.ts'
			},
			bundle: true,
			write: false,
			format: 'esm',
			platform: 'browser',
			minify: true,
			plugins: [descriptorPlugin]
		});
		const code = bundled.outputFiles[0]!.text;

		expect(code).toContain('@exact/client-component-descriptor');
		expect(code).toContain(usedId);
		expect(code).not.toContain(unusedId);
		expect(code).not.toContain('innerHeight');

		const lazy = await esbuild({
			stdin: {
				contents: `export async function load() { return (await import("exact-components")).Used; }`,
				loader: 'ts',
				sourcefile: 'entry.ts'
			},
			bundle: true,
			write: false,
			outdir: 'out',
			splitting: true,
			format: 'esm',
			platform: 'browser',
			minify: true,
			plugins: [descriptorPlugin]
		});
		const lazyDescriptorChunk = lazy.outputFiles.find(
			(file) =>
				file.text.includes('@exact/client-component-descriptor') && file.text.includes(usedId)
		);

		expect(lazyDescriptorChunk).toBeDefined();
		expect(lazy.outputFiles.length).toBeGreaterThan(1);
		expect(
			lazy.outputFiles
				.filter((file) => file !== lazyDescriptorChunk)
				.every((file) => !file.text.includes(usedId))
		).toBe(true);
	});

	it('keeps used CSS Modules and removes unused component styles from a side-effect-free package', async () => {
		const root = await createTestWorkspace('.exact-css-module-bundle-', process.cwd());
		const packageRoot = path.join(root, 'node_modules', 'exact-components');
		await mkdir(packageRoot, { recursive: true });
		await writeFile(
			path.join(packageRoot, 'package.json'),
			JSON.stringify({
				name: 'exact-components',
				type: 'module',
				sideEffects: false,
				exports: './index.ts'
			})
		);
		await writeFile(
			path.join(packageRoot, 'index.ts'),
			`
      export { Used } from "./used.ts";
      export { Unused } from "./unused.ts";
    `
		);
		await writeFile(
			path.join(packageRoot, 'used.ts'),
			transform(
				`
      import styles from "./used.module.css";
      export function Used() {
        return styles.root;
      }
    `,
				{ filename: 'used.ts', target: 'client' }
			)
		);
		await writeFile(
			path.join(packageRoot, 'unused.ts'),
			transform(
				`
      import styles from "./unused.module.css";
      export function Unused() {
        return styles.root;
      }
    `,
				{ filename: 'unused.ts', target: 'client' }
			)
		);
		await writeFile(path.join(packageRoot, 'used.module.css'), '.root { color: green; }\n');
		await writeFile(path.join(packageRoot, 'unused.module.css'), '.root { color: red; }\n');

		const entry = path.join(root, 'entry.ts');
		await writeFile(entry, `import { Used } from "exact-components"; console.log(Used());`);
		const { build: viteBuild } = await import('vite');
		const built = await viteBuild({
			root,
			logLevel: 'silent',
			build: {
				write: false,
				minify: false,
				rollupOptions: { input: entry }
			}
		});
		const outputs = (Array.isArray(built) ? built : [built]).flatMap((result) =>
			'output' in result ? result.output : []
		);
		const javascript = outputs
			.filter((output) => output.type === 'chunk')
			.map((output) => output.code)
			.join('\n');
		const css = outputs
			.flatMap((output) =>
				output.type === 'asset' && output.fileName.endsWith('.css') ? [String(output.source)] : []
			)
			.join('\n');

		expect(javascript).toContain('function Used');
		expect(javascript).not.toContain('function Unused');
		expect(css).not.toBe('');
		expect(css).toContain('green');
		expect(css).not.toContain('red');
	});

	it('preserves default and aliased component exports with attached descriptors', async () => {
		const root = await createTestWorkspace('exact-descriptor-exports-');
		const input = path.join(root, 'src', 'components.tsx');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      export default function DefaultWidget(this: Component<{}>) {
        window.location.href;
        return () => null;
      }
      function AliasedWidget(this: Component<{}>) {
        window.location.hash;
        return () => null;
      }
      export { AliasedWidget as RenamedWidget };
    `
		);
		const result = await compileFileArtifacts(input, {
			outDir: path.join(root, 'dist'),
			rootDir: path.join(root, 'src')
		});
		const client = await readFile(result.clientFile, 'utf8');

		expect(client).toContain('export default DefaultWidget;');
		expect(client).toContain('export { AliasedWidget as RenamedWidget };');
		expect(client.match(/@exact\/client-component-descriptor/g)).toHaveLength(1);
		expect(client.match(/Object\.assign/g)).toHaveLength(2);
		expect(result.manifest.exports).toContainEqual(
			expect.objectContaining({
				name: 'default',
				kind: 'component'
			})
		);
		expect(result.manifest.exports).toContainEqual(
			expect.objectContaining({
				name: 'RenamedWidget',
				kind: 'component'
			})
		);
	});

	it('resolves exact artifact facade imports without bundler-specific code', () => {
		expect(exactExportConditions('client')).toEqual(['exact-client']);
		expect(exactExportConditions('server', { serverCondition: 'react-server' })).toEqual([
			'react-server'
		]);
		expect(resolveExactArtifactImport('./Panel.exact', '/app/src/main.ts', 'client')).toEqual({
			id: path.resolve('/app/src/Panel.exact.client.ts'),
			target: 'client'
		});
		expect(resolveExactArtifactImport('./Panel.exact', '/app/src/main.jsx', 'server')).toEqual({
			id: path.resolve('/app/src/Panel.exact.server.js'),
			target: 'server'
		});
		expect(resolveExactArtifactImport('./Panel', '/app/src/main.ts', 'client')).toBeNull();
	});

	it('prefers existing exact artifact files when resolving facades', async () => {
		const root = await createTestWorkspace('exact-facade-resolution-');
		const importer = path.join(root, 'src', 'main.ts');
		const artifact = path.join(root, 'src', 'Panel.exact.client.js');
		await mkdir(path.dirname(artifact), { recursive: true });
		await writeFile(artifact, 'export const ready = true;');

		expect(resolveExactArtifactImport('./Panel.exact', importer, 'client')).toEqual({
			id: artifact,
			target: 'client'
		});
	});

	it('creates bundler-neutral exact artifact graphs', async () => {
		const root = await createTestWorkspace('exact-artifact-graph-');
		const input = path.join(root, 'src', 'panel.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
      }
    `
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const graph = createExactArtifactGraph([result], {
			packageRoot: root,
			sourceRoot: path.join(root, 'src')
		});

		expect(graph.conditions).toEqual({
			client: ['exact-client'],
			server: ['exact-server']
		});
		expect(graph.packageExports['./panel']).toEqual({
			'exact-client': './dist/panel.exact.client.ts',
			'exact-server': './dist/panel.exact.server.ts',
			default: './dist/panel.exact.client.ts'
		});
		expect(graph.clientIslands).toEqual([
			expect.objectContaining({
				name: 'Panel_ExactClient_1',
				exportName: 'Panel_ExactClient_1',
				module: './dist/panel.exact.client.ts'
			})
		]);
		expect(graph.serverParts).toEqual([
			expect.objectContaining({
				name: 'Panel_ExactServer_1',
				exportName: 'Panel_ExactServer_1',
				module: './dist/panel.exact.server.ts'
			})
		]);
		expect(graph.artifacts).toEqual([
			expect.objectContaining({
				inputFile: input,
				clientFile: result.clientFile,
				serverFile: result.serverFile,
				manifestFile: result.manifestFile
			})
		]);
	});

	it('reads generated artifact manifests into graph entries', async () => {
		const root = await createTestWorkspace('exact-artifact-manifest-entries-');
		const input = path.join(root, 'src', 'panel.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
      }
    `
		);

		const compiled = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const entries = await readExactArtifactManifestEntries([compiled.manifestFile]);
		const graph = createExactArtifactGraph(entries, {
			packageRoot: root,
			sourceRoot: path.join(root, 'src'),
			rootDir: root
		});

		expect(entries).toEqual([
			{
				inputFile: compiled.inputFile,
				clientFile: compiled.clientFile,
				serverFile: compiled.serverFile,
				manifestFile: compiled.manifestFile,
				manifest: expect.objectContaining({
					filename: compiled.manifest.filename
				})
			}
		]);
		expect(graph.clientIslands).toEqual([
			expect.objectContaining({
				name: 'Panel_ExactClient_1',
				module: './dist/panel.exact.client.ts'
			})
		]);
		expect(graph.serverParts).toEqual([
			expect.objectContaining({
				name: 'Panel_ExactServer_1',
				module: './dist/panel.exact.server.ts'
			})
		]);
	});

	it('rejects unsupported generated artifact manifest versions', async () => {
		const root = await createTestWorkspace('exact-artifact-manifest-version-');
		const manifestFile = path.join(root, 'panel.exact.manifest.json');
		await writeFile(
			manifestFile,
			JSON.stringify({
				version: exactCompilerManifestVersion + 1,
				artifacts: {
					source: 'panel.tsx',
					client: 'panel.exact.client.ts',
					server: 'panel.exact.server.ts',
					manifest: 'panel.exact.manifest.json',
					exports: [],
					symbols: [],
					boundaries: []
				}
			})
		);

		await expect(readExactArtifactManifestEntries([manifestFile])).rejects.toThrow(
			'Unsupported eXact artifact manifest version'
		);
	});

	it('rejects malformed compiler manifests before use', () => {
		expect(() =>
			parseExactCompilerManifest(
				{
					version: exactCompilerManifestVersion,
					filename: 'Panel.tsx',
					components: []
				},
				'Panel.exact.manifest.json'
			)
		).toThrow('Malformed eXact compiler manifest');
	});

	it('rejects unsupported versions and malformed v1 callable graphs', () => {
		const manifest = analyzeSource(`export function value() { return 1; }`, {
			filename: 'value.ts'
		});
		expect(() =>
			parseExactCompilerManifest({ ...manifest, version: -1 } as never, 'unsupported.json')
		).toThrow('Unsupported eXact compiler manifest version in unsupported.json: -1');
		expect(() =>
			parseExactCompilerManifest(
				{ ...manifest, dependencies: ['C:\\private\\value.ts'] },
				'absolute.json'
			)
		).toThrow('Malformed eXact compiler dependencies');
		expect(() =>
			parseExactCompilerManifest(
				{
					...manifest,
					callables: manifest.callables.map((callable, index) =>
						index
							? callable
							: {
									...callable,
									calls: [{ id: 'dangling', name: 'missing', targetId: 'missing', resolved: true }]
								}
					)
				},
				'dangling.json'
			)
		).toThrow('Malformed eXact compiler callable graph');
		expect(() =>
			parseExactCompilerManifest(
				{
					...manifest,
					callables: manifest.callables.map((callable, index) =>
						index
							? callable
							: {
									...callable,
									stateWrites: [
										{
											path: 'x',
											kind: 'write',
											confidence: 'exact',
											receiver: { kind: 'parameter' }
										}
									]
								}
					)
				} as never,
				'nested.json'
			)
		).toThrow('Malformed eXact compiler callable summaries');
	});

	it('projects binder identities onto the declared portable manifest filename', () => {
		const manifest = analyzeSource('export function View() { return () => <p />; }', {
			filename: 'src/View.tsx'
		});
		const serialized = JSON.stringify(manifest.semanticGraph);
		expect(serialized).toContain('src/view.tsx:');
		expect(serialized).not.toMatch(/[a-z]:\/(?:users|home)\//i);
	});

	it('validates semantic graph metadata in parsed compiler manifests', () => {
		const manifest = analyzeSource(
			`
      export function Panel() {
        return () => <p>Ready</p>;
      }
    `,
			{ filename: 'Panel.tsx' }
		);

		expect(
			parseExactCompilerManifest(manifest, 'Panel.exact.manifest.json').semanticGraph?.exports
		).toHaveLength(1);
		expect(() =>
			parseExactCompilerManifest(
				{
					...manifest,
					semanticGraph: {
						...manifest.semanticGraph,
						references: [{ name: 'Panel' }]
					}
				},
				'Panel.exact.manifest.json'
			)
		).toThrow('Malformed eXact compiler semantic graph');
	});

	it('rejects malformed generated artifact metadata', async () => {
		const root = await createTestWorkspace('exact-artifact-manifest-malformed-');
		const manifestFile = path.join(root, 'panel.exact.manifest.json');
		await writeFile(
			manifestFile,
			JSON.stringify({
				version: exactCompilerManifestVersion,
				filename: 'panel.tsx',
				dependencies: [],
				assets: [],
				components: [],
				exports: [],
				symbols: [],
				boundaries: [],
				callables: [],
				policy: { version: 1, subjects: [], flows: [], secretConsumers: [] },
				artifacts: {
					source: 1,
					client: 'panel.exact.client.ts',
					server: 'panel.exact.server.ts',
					manifest: 'panel.exact.manifest.json',
					exports: [],
					symbols: [],
					boundaries: []
				},
				serverActions: {},
				diagnostics: []
			})
		);

		await expect(readExactArtifactManifestEntries([manifestFile])).rejects.toThrow(
			'malformed artifact metadata'
		);
	});

	it('plans generated artifact paths without compiling', async () => {
		const root = await createTestWorkspace('exact-artifact-plan-');
		const src = path.join(root, 'src');
		const outDir = path.join(root, '.exact');
		await mkdir(path.join(src, 'components'), { recursive: true });
		await writeFile(
			path.join(src, 'components', 'panel.tsx'),
			'export function Panel() { return () => <p />; }'
		);
		await writeFile(path.join(src, 'skip.ts'), 'export const skip = 1;');

		const plan = await createExactArtifactPlan([src], {
			outDir,
			rootDir: src
		});

		expect(plan).toEqual({
			rootDir: src,
			entries: [
				{
					inputFile: path.join(src, 'components', 'panel.tsx'),
					clientFile: path.join(outDir, 'components', 'panel.exact.client.ts'),
					serverFile: path.join(outDir, 'components', 'panel.exact.server.ts'),
					sharedFile: path.join(outDir, 'components', 'panel.exact.shared.ts'),
					manifestFile: path.join(outDir, 'components', 'panel.exact.manifest.json')
				}
			]
		});
	});

	it('diffs exact artifact plans for dev-server orchestration', () => {
		const previous = {
			rootDir: '/app/src',
			entries: [planEntry('/app/src/a.tsx'), planEntry('/app/src/removed.tsx')]
		};
		const next = {
			rootDir: '/app/src',
			entries: [planEntry('/app/src/a.tsx'), planEntry('/app/src/added.tsx')]
		};

		expect(diffExactArtifactPlans(previous, next)).toEqual({
			added: [planEntry('/app/src/added.tsx')],
			removed: [planEntry('/app/src/removed.tsx')],
			changed: [],
			retained: [planEntry('/app/src/a.tsx')]
		});

		expect(
			diffExactArtifactPlans(previous, next, {
				changedInputs: ['/app/src/a.tsx']
			})
		).toEqual({
			added: [planEntry('/app/src/added.tsx')],
			removed: [planEntry('/app/src/removed.tsx')],
			changed: [planEntry('/app/src/a.tsx')],
			retained: []
		});
	});

	it('compiles selected artifact plan entries for incremental builds', async () => {
		const root = await createTestWorkspace('exact-artifact-entry-');
		const src = path.join(root, 'src');
		const outDir = path.join(root, '.exact');
		const changedInput = path.join(src, 'changed.tsx');
		const retainedInput = path.join(src, 'retained.tsx');
		await mkdir(src, { recursive: true });
		await writeFile(changedInput, 'export function Changed() { return () => <p>Changed</p>; }');
		await writeFile(retainedInput, 'export function Retained() { return () => <p>Retained</p>; }');

		const previous = await createExactArtifactPlan([src], {
			outDir,
			rootDir: src
		});
		const next = await createExactArtifactPlan([src], {
			outDir,
			rootDir: src
		});
		const diff = diffExactArtifactPlans(previous, next, {
			changedInputs: [changedInput]
		});
		const results = await compileArtifactPlanEntries(diff.changed);

		expect(results).toHaveLength(1);
		expect(results[0]!.inputFile).toBe(changedInput);
		expect(await readFile(results[0]!.clientFile, 'utf8')).toContain('changed.exact.shared.ts');
		expect(await readFile(results[0]!.sharedFile!, 'utf8')).toContain('Changed');
		await expect(readFile(path.join(outDir, 'retained.exact.client.ts'), 'utf8')).rejects.toThrow();
	});

	it('uses retained manifests when compiling selected artifact plan entries', async () => {
		const root = await createTestWorkspace('exact-artifact-retained-manifests-');
		const src = path.join(root, 'src');
		const outDir = path.join(root, '.exact');
		const widgetInput = path.join(src, 'ClientWidget.tsx');
		const pageInput = path.join(src, 'Page.tsx');
		await mkdir(src, { recursive: true });
		await writeFile(
			widgetInput,
			`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `
		);
		await writeFile(
			pageInput,
			`
      import { ClientWidget } from "./ClientWidget";

      export function Page() {
        return () => <ClientWidget />;
      }
    `
		);

		const initial = await compileProjectArtifacts([src], {
			outDir,
			rootDir: src
		});
		const retained = await readExactArtifactManifestEntries(
			initial
				.filter((result) => result.inputFile === widgetInput)
				.map((result) => result.manifestFile)
		);
		const plan = await createExactArtifactPlan([src], {
			outDir,
			rootDir: src
		});
		const changedPage = plan.entries.filter((entry) => entry.inputFile === pageInput);
		const updated = await compileArtifactPlanEntries(changedPage, {
			importedManifests: retained.map((entry) => entry.manifest)
		});
		const server = await readFile(updated[0]!.serverFile, 'utf8');

		expect(server).toContain('__exactBoundary');
		expect(server).toContain('"ClientWidget"');
		expect(server).not.toContain('from "./ClientWidget"');
	});

	it('updates dev-server artifact state with retained manifest context', async () => {
		const root = await createTestWorkspace('exact-artifact-dev-state-');
		const src = path.join(root, 'src');
		const outDir = path.join(root, '.exact');
		const widgetInput = path.join(src, 'ClientWidget.tsx');
		const pageInput = path.join(src, 'Page.tsx');
		await mkdir(src, { recursive: true });
		await writeFile(
			widgetInput,
			`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `
		);
		await writeFile(
			pageInput,
			`
      import { ClientWidget } from "./ClientWidget";

      export function Page() {
        return () => <ClientWidget />;
      }
    `
		);

		const state = await createExactArtifactDevState([src], {
			outDir,
			rootDir: src,
			packageRoot: root,
			sourceRoot: src
		});
		await writeFile(
			pageInput,
			`
      import { ClientWidget } from "./ClientWidget";

      export function Page() {
        return () => <main><ClientWidget /></main>;
      }
    `
		);

		const updated = await updateExactArtifactDevState(state, [src], [pageInput], {
			outDir,
			rootDir: src,
			packageRoot: root,
			sourceRoot: src
		});
		const pageServer = await readFile(updated.compiled[0]!.serverFile, 'utf8');

		expect(updated.diff.changed).toEqual([expect.objectContaining({ inputFile: pageInput })]);
		expect(updated.compiled.map((result) => result.inputFile)).toEqual([pageInput]);
		expect(updated.entries.map((entry) => entry.inputFile).sort()).toEqual(
			[pageInput, widgetInput].sort()
		);
		expect(updated.graph.artifacts.map((entry) => entry.inputFile).sort()).toEqual(
			[pageInput, widgetInput].sort()
		);
		expect(pageServer).toContain('__exactBoundary');
		expect(pageServer).toContain('"ClientWidget"');
		expect(pageServer).not.toContain('from "./ClientWidget"');
	});
});

function planEntry(inputFile: string) {
	const base = inputFile.replace(/\.tsx$/, '');
	return {
		inputFile,
		clientFile: `${base}.exact.client.ts`,
		serverFile: `${base}.exact.server.ts`,
		sharedFile: `${base}.exact.shared.ts`,
		manifestFile: `${base}.exact.manifest.json`
	};
}
