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

describe('@exactjs/compiler: artifacts', () => {
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
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n      function Page(this: Component<{ title?: string }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.latest()) => {\n          this.state.title = await readFile("title.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <h1>{this.state.title}</h1>;\n      }\n    '
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
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n      export function Page(this: Component<{ title?: string; width?: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          this.state.title = await readFile("title.txt", "utf8");\n        };\nrunFixtureTask();\n        const runFixtureTask2 = (_task: TaskContext = TaskContext.client()) => {\n          this.state.width = window.innerWidth;\n        };\nrunFixtureTask2();\n        return () => <h1>{this.state.title}</h1>;\n      }\n    '
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
		expect(client).toContain('export const Page');
		expect(server).toContain('node:fs/promises');
		expect(server).not.toContain('window.innerWidth');
		expect(server).toContain('export const Page');
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
					target: 'both'
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

	it('attaches named target-local contracts to the public component function', async () => {
		const root = await createTestWorkspace('exact-descriptor-');
		const input = path.join(root, 'src', 'panel.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			'import { TaskContext } from "@exactjs/core";\n\n      export function Panel(this: Component<{ count: number }>) {\n        const runFixtureTask = (_task: TaskContext = TaskContext.server()) => { this.state.count = 1; };\nrunFixtureTask();\n        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;\n      }\n    '
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const client = await readFile(result.clientFile, 'utf8');
		const server = await readFile(result.serverFile, 'utf8');
		const rootSymbol = result.manifest.symbols.find((symbol) => symbol.role === 'root')!;
		const serverPartSymbol = result.manifest.symbols.find(
			(symbol) => symbol.role === 'server-part'
		)!;

		expect(client).toContain('Symbol.for("@exactjs/component-contract")');
		expect(client).toMatch(
			new RegExp(
				`id: "${rootSymbol.id}"[\\s\\S]*name: "${rootSymbol.generatedName}"[\\s\\S]*role: "root"[\\s\\S]*implementation: __exactImplementation_Panel_`
			)
		);
		expect(client).toMatch(
			/export const Panel: typeof __exactImplementation_Panel_\d+ = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/
		);
		expect(server).toContain('Symbol.for("@exactjs/component-contract")');
		expect(server).toMatch(
			new RegExp(
				`id: "${serverPartSymbol.id}"[\\s\\S]*name: "${serverPartSymbol.generatedName}"[\\s\\S]*role: "server-part"[\\s\\S]*implementation: __exactImplementation_Panel_`
			)
		);
		expect(server).toMatch(
			/export const Panel: typeof __exactImplementation_Panel_\d+ = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/
		);
		expect(client).not.toContain('parts:');
		expect(server).not.toContain('parts:');
		expect(client).toContain('executors: []');
		expect(server).toContain('executors: [');
		expect(server).toMatch(
			/execute: async \(__exactActivation_\d+: any, __exactExecution_\d+: any\)/
		);
		expect(server).toMatch(/__exactWrite\(__exactComponent_\d+\.state, \["count"\]/);
		expect(result.manifest.artifacts?.exports).toContainEqual(
			expect.objectContaining({
				name: 'Panel',
				artifactClass: 'dual'
			})
		);
	});

	it('preserves awaited server task value flow in both client and executor artifacts', async () => {
		const root = await createTestWorkspace('exact-awaited-server-task-');
		const input = path.join(root, 'src', 'options.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
			import { TaskContext, type Component } from "@exactjs/core";
			declare function getOptions(
				destination: string,
				options?: { signal?: AbortSignal }
			): Promise<string[]>;
			export function ShippingOptions(
				this: Component<{ destination: string; options: string[] }>
			) {
				async function loadOptions(
					destination: string,
					task: TaskContext = TaskContext.server().blocking()
				) {
					return getOptions(destination, { signal: task.signal });
				}
				this.state.options = await loadOptions(this.state.destination);
				return () => <button onClick={() => this.state.destination = "next"}>
					{this.state.options.join(",")}
				</button>;
			}
		`
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const client = await readFile(result.clientFile, 'utf8');
		const server = await readFile(result.serverFile, 'utf8');

		expect(client).toContain('__exactActivateTask(this, __exactDefineTask({');
		expect(client).toContain('__exactDispatchContinuation');
		expect(client).toContain('readiness: "blocking"');
		expect(server).toContain('executors: [');
		expect(server).toContain('getOptions(');
		expect(server).toContain('__exactExecution_');
		expect(server).not.toContain('__exactStageTaskMutation');
		expect(server).toMatch(/__exactComponent_\d+\.state, \["options"\]/);
	});

	it('infers a server continuation from an ordinary async component assignment', async () => {
		const root = await createTestWorkspace('exact-inferred-async-server-');
		const input = path.join(root, 'src', 'options.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
			import type { Component } from "@exactjs/core";
			/** @exact server */
			declare function getOptions(destination: string): Promise<string[]>;
			export async function ShippingOptions(
				this: Component<{ destination: string; options: string[]; settled: boolean }>
			) {
				try {
					this.state.options = await getOptions(this.state.destination);
				} catch (error) {
					this.state.options = [String(error)];
				} finally {
					this.state.settled = true;
				}
				return () => <button onClick={() => this.state.destination = "next"}>
					{this.state.options.join(",")}
				</button>;
			}
		`
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const client = await readFile(result.clientFile, 'utf8');
		const server = await readFile(result.serverFile, 'utf8');

		expect(client).toContain('__exactActivateTask(this, __exactDefineTask({');
		expect(client).toContain('__exactDispatchContinuation');
		expect(client).toContain('readiness: "blocking"');
		expect(server).toContain('executors: [');
		expect(server).toContain('getOptions(');
		expect(server).toContain('if (__exactComponentTaskContext.signal.aborted)');
		expect(server).not.toContain('__exactStageTaskMutation');
		expect(server).toMatch(/__exactComponent_\d+\.state, \["options"\]/);
		expect(server).toMatch(/__exactComponent_\d+\.state, \["settled"\]/);
	});

	it('keeps direct server-context dependencies out of client activation records', async () => {
		const root = await createTestWorkspace('exact-continuation-context-');
		const input = path.join(root, 'src', 'panel.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			'import { TaskContext } from "@exactjs/core";\n\n      import type { Component, ContextToken } from "@exactjs/core";\n      declare const DatabaseContext: ContextToken<{\n        find(id: string): Promise<{ title: string }>;\n      }>;\n      export function Panel(this: Component<{ id: string; title?: string }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          const row = await this.getContext(DatabaseContext).find(this.state.id);\n          this.state.title = row.title;\n        };\nrunFixtureTask();\n        return () => <button onClick={() => this.state.id = "next"}>{this.state.title}</button>;\n      }\n    '
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const client = await readFile(result.clientFile, 'utf8');
		const server = await readFile(result.serverFile, 'utf8');

		expect(client).not.toContain('this.reactive(() => this.getContext(DatabaseContext))');
		expect(client).toContain('__exactActivateTask(this, __exactDefineTask({');
		expect(client).toContain('(...__exactTaskArgs: any[]) => {');
		expect(client).toContain(
			'__exactTaskArgs, __exactTaskContext.signal, [], __exactTaskContext.generation'
		);
		expect(client).toContain('this.reactive(() => this.state.id)');
		expect(server).toMatch(
			/__exactExecution_\d+\.getContext\(DatabaseContext, "DatabaseContext"\)\.find\(__exactDependency\)/
		);
		expect(server).toContain('serverContexts: [\n                    "DatabaseContext"');
	});

	it('does not retain continuation machinery for components without a client machine', async () => {
		const root = await createTestWorkspace('exact-server-only-continuation-');
		const input = path.join(root, 'src', 'page.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			'import { TaskContext } from "@exactjs/core";\n\n      export function Page(this: Component<{ ready: boolean }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await Promise.resolve();\n          this.state.ready = true;\n        };\nrunFixtureTask();\n        return () => <section>\n          <p>{this.state.ready ? "Ready" : "Loading"}</p>\n          <button onClick={() => console.log("client")}>Open</button>\n        </section>;\n      }\n    '
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src'),
			serverComponents: true
		});
		const client = await readFile(result.clientFile, 'utf8');
		const server = await readFile(result.serverFile, 'utf8');

		expect(client).not.toContain('dispatchComponentContinuation');
		expect(client).not.toContain('taskAwait');
		expect(client).toContain('executors: []');
		expect(server).toContain('continuations: []');
		expect(server).toContain('executors: []');
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

	it('routes barrel exports through target artifacts and infers transitive task placement', async () => {
		const root = await createTestWorkspace('exact-artifact-barrel-');
		const srcDir = path.join(root, 'src');
		const components = path.join(srcDir, 'components');
		const outDir = path.join(root, '.exact');
		await mkdir(components, { recursive: true });
		await writeFile(path.join(srcDir, 'App.tsx'), `export { Page } from './components/page.js';`);
		await writeFile(
			path.join(components, 'page.tsx'),
			"import { TaskContext } from \"@exactjs/core\";\n\n      import type { Component } from '@exactjs/core';\n      import { quote } from '../provider.js';\n      import { Workspace } from './workspace.js';\n      export function Page(this: Component<{ value: string }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.latest()) => { this.state.value = await quote(); };\nrunFixtureTask();\n        return () => <main>{this.state.value}<Workspace /></main>;\n      }\n    "
		);
		await writeFile(
			path.join(srcDir, 'provider.ts'),
			`export async function quote() { return process.env.QUOTE ?? 'ready'; }`
		);
		await writeFile(
			path.join(components, 'workspace.tsx'),
			`
      import type { Component } from '@exactjs/core';
      import { renderWorkspace } from './workspace-view.js';
      export function Workspace(this: Component<{ count: number }>) {
        this.state.count = 0;
        return () => renderWorkspace(() => this.state.count++);
      }
    `
		);
		await writeFile(
			path.join(components, 'workspace-view.tsx'),
			`export function renderWorkspace(click: () => void) { return <div>{(['one', 'two'] as const).map(value => <button onClick={click}>{value}</button>)}</div>; }`
		);

		const results = await compileProjectArtifacts([path.join(srcDir, 'App.tsx')], {
			outDir,
			rootDir: srcDir,
			serverComponents: true
		});
		const app = results.find((result) => path.basename(result.inputFile) === 'App.tsx')!;
		const page = results.find((result) => path.basename(result.inputFile) === 'page.tsx')!;
		const workspace = results.find(
			(result) => path.basename(result.inputFile) === 'workspace.tsx'
		)!;
		const workspaceView = results.find(
			(result) => path.basename(result.inputFile) === 'workspace-view.tsx'
		)!;
		const appServer = await readFile(app.serverFile, 'utf8');
		const pageServer = await readFile(page.serverFile, 'utf8');
		const pageClient = await readFile(page.clientFile, 'utf8');
		const workspaceServer = await readFile(workspace.serverFile, 'utf8');
		const workspaceClient = await readFile(workspace.clientFile, 'utf8');
		const workspaceViewClient = await readFile(workspaceView.clientFile, 'utf8');

		expect(results.map((result) => path.basename(result.inputFile)).sort()).toEqual([
			'App.tsx',
			'page.tsx',
			'workspace-view.tsx',
			'workspace.tsx'
		]);
		expect(appServer).toContain('./components/page.exact.server.js');
		expect(pageServer).toContain('createServerBoundary as __exactBoundary');
		expect(pageServer).not.toContain('./workspace.exact.server.js');
		expect(pageServer).not.toContain('./workspace.js');
		expect(workspaceServer).toContain('createServerBoundary as __exactBoundary');
		expect(workspaceClient).toContain('./workspace-view.exact.client.js');
		expect(workspaceViewClient).toContain('__exactVNode');
		expect(workspaceViewClient).toContain("(['one', 'two'] as const).map(");
		expect(workspaceViewClient).not.toContain('this.map(');
		expect(workspaceViewClient).not.toContain('Anonymous_ExactClient');
		expect(workspaceView.manifest.components).toEqual([]);
		expect(pageClient).not.toContain('../provider.js');
		expect(page.manifest.components[0]?.tasks[0]?.placement).toBe('server');
		expect(workspace.manifest.components[0]).toMatchObject({
			placement: 'client',
			artifactTargets: ['client']
		});
	}, 15_000);

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
