import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	assertExactArtifactTarget,
	compileFile,
	compileFileArtifacts,
	compileProjectArtifacts,
	createPackageExportMap
} from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';

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
});
