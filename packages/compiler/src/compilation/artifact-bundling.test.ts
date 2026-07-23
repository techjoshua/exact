import { build as esbuild, type Plugin } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	compileFileArtifacts,
	createExactArtifactGraph,
	exactExportConditions,
	readExactArtifactManifestEntries,
	resolveExactArtifactImport,
	transform
} from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';

describe('@exactjs/compiler: artifact bundling', () => {
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

		expect(code).toContain('@exactjs/client-component-descriptor');
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
				file.text.includes('@exactjs/client-component-descriptor') && file.text.includes(usedId)
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
		expect(client.match(/@exactjs\/client-component-descriptor/g)).toHaveLength(1);
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
});
