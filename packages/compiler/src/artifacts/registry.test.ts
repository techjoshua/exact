import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	compileFileArtifacts,
	createClientIslandRegistryEntries,
	createClientIslandRegistryModule,
	createExactArtifactGraph,
	createExactArtifactRegistryModules,
	createExactHydrationRegistrationModule,
	createServerPartRegistryEntries,
	createServerPartRegistryModule,
	transform
} from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';

describe('@exactjs/compiler: registries', () => {
	it('creates client island registry entries for generated client artifacts', async () => {
		const root = await createTestWorkspace('exact-island-registry-');
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

		expect(
			createClientIslandRegistryEntries([result], {
				rootDir: root
			})
		).toEqual([
			expect.objectContaining({
				id: expect.any(String),
				name: 'Panel_ExactClient_1',
				exportName: 'Panel_ExactClient_1',
				module: './dist/panel.exact.client.ts',
				componentId: result.manifest.components[0]!.id
			})
		]);
	});

	it('creates client registry entries for exported pure client components', async () => {
		const root = await createTestWorkspace('exact-client-root-registry-');
		const input = path.join(root, 'src', 'ClientWidget.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});

		expect(
			createClientIslandRegistryEntries([result], {
				rootDir: root
			})
		).toContainEqual({
			id: expect.any(String),
			name: 'ClientWidget',
			exportName: 'ClientWidget',
			module: './dist/ClientWidget.exact.client.ts',
			componentId: result.manifest.components[0]!.id
		});
	});

	it('creates client registry modules for default-exported client roots', async () => {
		const root = await createTestWorkspace('exact-default-client-root-registry-');
		const input = path.join(root, 'src', 'ClientWidget.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      export default function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const module = createClientIslandRegistryModule(
			createClientIslandRegistryEntries([result], {
				rootDir: root
			})
		);

		expect(module).toContain(
			'import { default as __exactRegistry0 } from "./dist/ClientWidget.exact.client.ts";'
		);
		expect(module).toContain('"ClientWidget": __exactRegistry0');
	});

	it('creates server part registry entries for generated server artifacts', async () => {
		const root = await createTestWorkspace('exact-server-part-registry-');
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

		expect(
			createServerPartRegistryEntries([result], {
				rootDir: root
			})
		).toEqual([
			{
				id: expect.any(String),
				name: 'Panel_ExactServer_1',
				exportName: 'Panel_ExactServer_1',
				module: './dist/panel.exact.server.ts',
				componentId: result.manifest.components[0]!.id
			}
		]);
	});

	it('creates ESM modules for client and server registries', () => {
		expect(
			createClientIslandRegistryModule([
				{
					id: 'client-1',
					name: 'Panel_ExactClient_1',
					exportName: 'Panel_ExactClient_1',
					module: './panel.exact.client.ts'
				}
			])
		).toBe(
			[
				'import { Panel_ExactClient_1 as __exactRegistry0 } from "./panel.exact.client.ts";',
				'',
				'export const exactClientIslands = {',
				'  "Panel_ExactClient_1": __exactRegistry0',
				'};',
				''
			].join('\n')
		);

		expect(
			createServerPartRegistryModule(
				[
					{
						id: 'server-1',
						name: 'Panel_ExactServer_1',
						exportName: 'Panel_ExactServer_1',
						module: './panel.exact.server.ts'
					}
				],
				{ exportName: 'parts' }
			)
		).toContain('export const parts');
	});

	it('rejects duplicate registry module names', () => {
		expect(() =>
			createClientIslandRegistryModule([
				{
					id: 'one',
					name: 'Panel',
					exportName: 'Panel',
					module: './one.ts'
				},
				{
					id: 'two',
					name: 'Panel',
					exportName: 'Panel',
					module: './two.ts'
				}
			])
		).toThrow('Duplicate eXact registry entry Panel');
	});

	it('deduplicates re-exported registry entries by component identity', () => {
		const module = createClientIslandRegistryModule([
			{
				id: 'barrel',
				name: 'Panel',
				exportName: 'Panel',
				module: './index.exact.client.ts'
			},
			{
				id: 'source',
				name: 'Panel',
				exportName: 'Panel',
				module: './components/Panel.exact.client.ts',
				componentId: 'component:panel'
			}
		]);

		expect(module).toContain('./components/Panel.exact.client.ts');
		expect(module).not.toContain('./index.exact.client.ts');
	});

	it('creates registry modules from artifact graphs', async () => {
		const root = await createTestWorkspace('exact-artifact-registry-modules-');
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
			sourceRoot: path.join(root, 'src'),
			rootDir: root
		});
		const modules = createExactArtifactRegistryModules(graph, {
			clientExportName: 'clientRegistry',
			serverExportName: 'serverRegistry'
		});

		expect(modules.client).toContain('export const clientRegistry');
		expect(modules.client).toContain('Panel_ExactClient_1');
		expect(modules.server).toContain('export const serverRegistry');
		expect(modules.server).toContain('Panel_ExactServer_1');
	});

	it('creates hydration registration modules from artifact graphs', async () => {
		const root = await createTestWorkspace('exact-hydration-registration-module-');
		const input = path.join(root, 'src', 'panel.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number; title: string }>) {
        this.task.server(async () => {
          this.state.title = await readFile("panel.txt", "utf8");
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
			sourceRoot: path.join(root, 'src'),
			rootDir: root
		});
		const actionId = Object.keys(result.manifest.serverActions)[0]!;
		const module = createExactHydrationRegistrationModule(graph, {
			endpoint: '/__exact',
			endpoints: {
				actions: { [actionId]: '/remote-exact' }
			},
			islandsExportName: 'islands',
			registrationExportName: 'registration'
		});

		expect(module).toContain('export const islands');
		expect(module).toContain('defineExactHydrationRegistration as __exactDefineRegistration');
		expect(module).toContain('lazyClientIsland as __exactLazyIsland');
		expect(module).toContain('import("./dist/panel.exact.client.js")');
		expect(module).toContain('.then((module) => module["Panel_ExactClient_1"])');
		expect(module).not.toContain('import { Panel');
		expect(module).toContain('export const registration');
		expect(module).toContain('islands: islands');
		expect(module).toContain('"endpoint": "/__exact"');
		expect(module).toContain('"/remote-exact"');
		expect(module).toContain(`${JSON.stringify(actionId)}: {`);
		expect(module).toContain('continuations: __exactContinuations');
		expect(module).not.toContain('"stateContracts"');
		expect(module).not.toContain('"actionBoundaries"');
	});

	it('registers continuation-owning dual-root components for client hydration', async () => {
		const root = await createTestWorkspace('exact-resumable-root-registration-');
		const input = path.join(root, 'src', 'workspace.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      import { TaskContext } from "@exactjs/core";

      export function Workspace(this: Component<{ count: number }>) {
        async function load(_task: TaskContext = TaskContext.server()) {
          return 1;
        }
        async function refresh(_task: TaskContext = TaskContext.client()) {
          localStorage.setItem("refreshing", "true");
          this.state.count = await load();
        }
        void refresh();
        return () => <output>{this.state.count}</output>;
      }
    `
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const graph = createExactArtifactGraph([result], {
			packageRoot: root,
			sourceRoot: path.join(root, 'src'),
			rootDir: root
		});
		const symbol = result.manifest.symbols.find(
			(candidate) => candidate.exportName === 'Workspace' && candidate.role === 'root'
		)!;
		const module = createExactHydrationRegistrationModule(graph);

		expect(symbol.target).toBe('both');
		expect(result.manifest.resumptions).toContainEqual(
			expect.objectContaining({ componentId: symbol.componentId })
		);
		expect(module).toContain('import("./dist/workspace.exact.client.js")');
		expect(module).toContain('.then((module) => module["Workspace"])');
	});

	it('does not promote state-only dual roots into standalone client islands', async () => {
		const root = await createTestWorkspace('exact-state-only-root-registration-');
		const input = path.join(root, 'src', 'Counter.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
				export function Counter(this: Component<{ count: number }>) {
					this.state.count = 1;
					return () => <output>{this.state.count}</output>;
				}
			`
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});

		expect(result.manifest.resumptions).toHaveLength(1);
		expect(result.manifest.continuations).toHaveLength(0);
		expect(createClientIslandRegistryEntries([result], { rootDir: root })).toEqual([]);
	});

	it('includes component render edges in artifact graphs', async () => {
		const root = await createTestWorkspace('exact-artifact-component-graph-');
		const input = path.join(root, 'src', 'page.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      function ClientWidget() {
        return () => <button onClick={() => save()}>Save</button>;
      }

      export function Page() {
        return () => <main><ClientWidget /></main>;
      }
    `
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const graph = createExactArtifactGraph([result], {
			packageRoot: root,
			sourceRoot: path.join(root, 'src'),
			rootDir: root
		});
		const page = result.manifest.components.find((component) => component.name === 'Page')!;
		const widget = result.manifest.components.find(
			(component) => component.name === 'ClientWidget'
		)!;

		expect(graph.componentEdges).toEqual([
			{
				id: expect.any(String),
				sourceFile: input,
				sourceComponentId: page.id,
				sourceName: 'Page',
				targetComponentId: widget.id,
				targetName: 'ClientWidget',
				tag: 'ClientWidget',
				placement: 'client',
				boundary: 'client',
				index: 1,
				path: expect.any(String)
			}
		]);
	});

	it('emits server boundary stubs for pure client components', async () => {
		const root = await createTestWorkspace('exact-split-');
		const input = path.join(root, 'src', 'panel.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      export function Panel(this: Component<{ count: number }>) {
        this.state.count = 0;
        return () => <section>
          <button className="primary" title={this.state.count} disabled onClick={() => this.state.count++}>{this.state.count}</button>
          <input ref={this.ref(inputRef)} />
        </section>;
      }
    `
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const client = await readFile(result.clientFile, 'utf8');
		const server = await readFile(result.serverFile, 'utf8');
		const islands = result.manifest.symbols.filter((symbol) => symbol.role === 'client-island');

		expect(result.manifest.components[0]!.clientIslandCount).toBe(2);
		expect(islands.map((symbol) => symbol.generatedName)).toEqual([
			'Panel_ExactClient_1',
			'Panel_ExactClient_2'
		]);
		expect(islands[0]!).toMatchObject({
			generatedName: 'Panel_ExactClient_1',
			localName: 'Panel_ExactClient_1',
			exportName: 'Panel_ExactClient_1',
			target: 'client',
			placement: 'client'
		});
		expect(client).toMatch(
			/export const Panel: typeof __exactImplementation_Panel_\d+ = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/
		);
		expect(client).not.toContain('export function Panel_ExactClient_1');
		expect(client).not.toContain('export function Panel_ExactClient_2');
		expect(server).toContain('createServerBoundary as');
		expect(server).toContain('export function Panel(props = {})');
		expect(server).not.toContain('Panel_ExactServer_1');
		expect(server).toContain('"Panel"');
		expect(server).not.toContain('Panel_ExactClient_1');
		expect(server).not.toContain('className: "primary"');
		expect(server).not.toContain('title: this.state.count');
		expect(server).not.toContain('onClick');
		expect(result.manifest.boundaries).toContainEqual({
			id: expect.any(String),
			name: 'Panel',
			componentId: result.manifest.components[0]!.id,
			ownerComponentId: result.manifest.components[0]!.id,
			kind: 'client-island'
		});
		expect(result.manifest.artifacts?.symbols).toEqual(result.manifest.symbols);
	});

	it('infers arbitrary dynamic client island props in isomorphic server artifacts', () => {
		const output = transform(
			`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const label = String(this.state.count);
        return () => <button title={label} onClick={() => this.state.count++} />;
      }
    `,
			{ filename: 'Panel.tsx', target: 'server', serverComponents: true }
		);

		expect(output).toContain('title: label');
		expect(output).toContain('"__exactState": { count: this.state.count }');
		expect(output).toContain('Panel_ExactClient_1');
		expect(output).not.toContain('onClick');
	});

	it('infers aliased state reads for client island snapshots', () => {
		const output = transform(
			`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ project: { title: string } }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const project = this.state.project;
        return () => <button title={project.title} onClick={() => project.title = "Updated"} />;
      }
    `,
			{ filename: 'Panel.tsx', target: 'server', serverComponents: true }
		);

		expect(output).toContain('"__exactState": { project: { title: this.state.project.title } }');
		expect(output).toContain('title: project.get().title');
		expect(output).not.toContain('onClick');
	});

	it('retains whole-object snapshots when a state alias is consumed as a value', () => {
		const output = transform(
			`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ project: { title: string } }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const project = this.state.project;
        return () => <button title={String(project)} onClick={() => save(project)} />;
      }
    `,
			{ filename: 'Panel.tsx', target: 'server', serverComponents: true }
		);

		expect(output).toContain('"__exactState": { project: this.state.project }');
		expect(output).not.toContain('onClick');
	});

	it('infers derived state reads for client island snapshots', () => {
		const output = transform(
			`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ project: { title: string; owner: string } }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const title = this.state.project.title;
        const label = \`\${title} by \${this.state.project.owner}\`;
        return () => <button title={label} onClick={() => this.state.project.title = "Updated"}>{label}</button>;
      }
    `,
			{ filename: 'Panel.tsx', target: 'server', serverComponents: true }
		);

		expect(output).toContain(
			'"__exactState": { project: { owner: this.state.project.owner, title: this.state.project.title } }'
		);
		expect(output).toContain('title: label');
		expect(output).not.toContain('onClick');
	});
});
