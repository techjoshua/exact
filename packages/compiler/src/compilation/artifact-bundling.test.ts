import { build as esbuild, type Plugin } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	assertExactClientArtifactIsolation,
	compileFileArtifacts,
	compileProjectArtifacts,
	createExactArtifactGraph,
	exactExportConditions,
	resolveExactArtifactImport,
	transform
} from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';

describe('@exactjs/compiler: artifact bundling', () => {
	it('keeps a transitive server data stack out of final client chunks and assets', async () => {
		const root = await createTestWorkspace('.exact-heavy-server-stack-', process.cwd());
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'dist');
		await mkdir(path.join(srcDir, 'data'), { recursive: true });
		await writeFile(
			path.join(srcDir, 'page.tsx'),
			'import { TaskContext } from "@exactjs/core";\n\n      import { queryProducts } from "./data/index.js";\n\n      export function Page(this: Component<{ count: number; name: string }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          const product = await queryProducts();\n          this.state.name = product.name;\n        };\nrunFixtureTask();\n        return () => <button onClick={() => this.state.count++}>{this.state.name}</button>;\n      }\n    '
		);
		await writeFile(
			path.join(srcDir, 'data', 'index.js'),
			`export { queryProducts } from "./apollo-client.js";`
		);
		await writeFile(
			path.join(srcDir, 'data', 'apollo-client.js'),
			`
      import { parseGraphql } from "./graphql-parser.js";
      export async function queryProducts() {
        const cache = await import("./tanstack-cache.js");
        return { name: parseGraphql("HEAVY_APOLLO_QUERY") + cache.cacheMarker };
      }
    `
		);
		await writeFile(
			path.join(srcDir, 'data', 'graphql-parser.js'),
			`
      import schemaUrl from "./schema.wasm";
      export function parseGraphql(value) {
        return value + schemaUrl + "HEAVY_GRAPHQL_PARSER";
      }
    `
		);
		await writeFile(
			path.join(srcDir, 'data', 'tanstack-cache.js'),
			`export const cacheMarker = "HEAVY_TANSTACK_CACHE";`
		);
		await writeFile(path.join(srcDir, 'data', 'schema.wasm'), 'HEAVY_SCHEMA_ASSET');

		const compiledResults = await compileProjectArtifacts([path.join(srcDir, 'page.tsx')], {
			outDir,
			rootDir: srcDir,
			sourceMap: true
		});
		const compiled = compiledResults.find(
			(result) => path.basename(result.inputFile) === 'page.tsx'
		)!;
		const client = await esbuild({
			stdin: {
				contents: await readFile(compiled.clientFile, 'utf8'),
				loader: 'ts',
				resolveDir: path.dirname(compiled.clientFile),
				sourcefile: path.basename(compiled.clientFile)
			},
			bundle: true,
			write: false,
			outdir: path.join(root, 'client-bundle'),
			format: 'esm',
			platform: 'browser',
			packages: 'external',
			external: ['@exactjs/*'],
			metafile: true,
			sourcemap: true,
			loader: { '.wasm': 'file' }
		});
		const clientInputs = Object.keys(client.metafile!.inputs).map((value) =>
			value.replaceAll('\\', '/')
		);
		const clientOutputs = client.outputFiles!.map((file) => ({
			fileName: path.basename(file.path),
			type: file.path.endsWith('.js') ? ('chunk' as const) : ('asset' as const),
			modules: clientInputs
		}));

		assertExactClientArtifactIsolation(clientOutputs);
		expect(clientInputs.some((value) => value.includes('/data/'))).toBe(false);
		expect(client.outputFiles!.map((file) => file.text).join('\n')).not.toMatch(
			/HEAVY_(?:APOLLO|GRAPHQL|TANSTACK|SCHEMA)/
		);
		expect(client.outputFiles!.some((file) => file.path.endsWith('.wasm'))).toBe(false);

		const serverFixturePlugin: Plugin = {
			name: 'exact-server-stack-fixture',
			setup(build) {
				build.onResolve({ filter: /^\./ }, (args) => {
					const importerDirectory = args.importer ? path.dirname(args.importer) : args.resolveDir;
					const resolved = path.resolve(importerDirectory, args.path);
					if (!resolved.startsWith(root)) return;
					return { path: resolved, namespace: 'exact-server-stack-fixture' };
				});
				build.onLoad({ filter: /.*/, namespace: 'exact-server-stack-fixture' }, async (args) => ({
					contents: await readFile(args.path),
					loader: args.path.endsWith('.wasm') ? 'file' : 'js'
				}));
			}
		};
		const server = await esbuild({
			stdin: {
				contents: await readFile(compiled.serverFile, 'utf8'),
				loader: 'ts',
				resolveDir: path.dirname(compiled.serverFile),
				sourcefile: path.basename(compiled.serverFile)
			},
			bundle: true,
			write: false,
			outdir: path.join(root, 'server-bundle'),
			format: 'esm',
			platform: 'node',
			packages: 'external',
			external: ['@exactjs/*'],
			metafile: true,
			loader: { '.wasm': 'file' },
			plugins: [serverFixturePlugin]
		});
		const serverInputs = Object.keys(server.metafile!.inputs)
			.map((value) => value.replaceAll('\\', '/'))
			.join('\n');

		expect(serverInputs).toContain('/data/apollo-client.js');
		expect(serverInputs).toContain('/data/graphql-parser.js');
		expect(serverInputs).toContain('/data/tanstack-cache.js');
		expect(server.outputFiles!.some((file) => file.path.endsWith('.wasm'))).toBe(true);
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
		const usedId = result.analysis.symbols.find(
			(symbol) =>
				symbol.target === 'client' && symbol.role === 'root' && symbol.debugName === 'Used'
		)!.id;
		const unusedId = result.analysis.symbols.find(
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

		expect(code).toContain('@exactjs/component-contract');
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
			(file) => file.text.includes('@exactjs/component-contract') && file.text.includes(usedId)
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
		expect(client.match(/@exactjs\/component-contract/g)).toHaveLength(1);
		expect(client.match(/Object\.assign/g)).toHaveLength(2);
		expect(result.analysis.exports).toContainEqual(
			expect.objectContaining({
				name: 'default',
				kind: 'component'
			})
		);
		expect(result.analysis.exports).toContainEqual(
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
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;\n      }\n    '
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
				serverFile: result.serverFile
			})
		]);
	});
});
