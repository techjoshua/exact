import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	compileFileArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule,
	transform
} from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { artifactAnalysis } from '../compilation/analysis-results.js';

describe('@exactjs/compiler: registries', () => {
	it('creates hydration registration modules from artifact graphs', async () => {
		const root = await createTestWorkspace('exact-hydration-registration-module-');
		const input = path.join(root, 'src', 'panel.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number; title: string }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          this.state.title = await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;\n      }\n    '
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
		const actionId = result.build.operations[0]!.id;
		const module = createExactHydrationRegistrationModule(graph, {
			endpoint: '/__exact',
			endpoints: {
				invocations: { [actionId]: '/remote-exact' }
			},
			islandsExportName: 'islands',
			registrationExportName: 'registration',
			clientBootstrapExportName: 'createPanelClient'
		});
		expect(graph.operations).toEqual(result.build.operations);
		expect(graph.artifacts[0]).not.toHaveProperty('build');
		expect(graph.artifacts[0]?.componentIds).toEqual(result.build.componentIds);

		expect(module).toContain('export const islands');
		expect(module).not.toContain('defineExactHydrationRegistration');
		expect(module).toContain('lazyClientIsland as __exactLazyIsland');
		expect(module).toContain('from "@exactjs/hydrate/framework/client-bootstrap"');
		expect(module).toContain('import("./dist/panel.exact.client.js")');
		expect(module).toContain('.then((module) => module["Panel_ExactClient_1"])');
		expect(module).toContain('"mode":"interaction"');
		expect(module).toContain('"replay":"native-click"');
		expect(module).not.toContain('import { Panel');
		expect(module).toContain('export const registration');
		expect(module).toContain('islands: islands');
		expect(module).toContain('"endpoint": "/__exact"');
		expect(module).toContain('"/remote-exact"');
		expect(module).toContain(`${JSON.stringify(actionId)}: {`);
		expect(module).toContain('continuations: __exactContinuations');
		expect(module).toContain('export function createPanelClient(root: Element');
		expect(module).toContain('...__exactReadConfig(root), ...registration, ...options');
		expect(module).toContain('"serverContexts": []');
		expect(module).toContain('"serverContextWrites": []');
		expect(module).toContain('"publicContexts": []');
		expect(module).not.toContain('"boundaries": []');
		expect(module).not.toContain('"stateContracts"');
		expect(module).not.toContain('"actionBoundaries"');
		expect(
			createExactHydrationRegistrationModule(graph, {
				preserveAuthoredModuleExtensions: true
			})
		).toContain('import("./dist/panel.exact.client.ts")');
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
		  this.state.count = 1;
        }
		function refresh(_task: TaskContext = TaskContext.client()) {
          localStorage.setItem("refreshing", "true");
        }
		load();
		refresh();
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
		const symbol = artifactAnalysis(result).symbols.find(
			(candidate) => candidate.exportName === 'Workspace' && candidate.role === 'root'
		)!;
		const module = createExactHydrationRegistrationModule(graph);

		expect(symbol.target).toBe('both');
		expect(artifactAnalysis(result).resumptions).toContainEqual(
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

		expect(artifactAnalysis(result).resumptions).toHaveLength(1);
		expect(result.build.operations).toHaveLength(0);
		expect(
			createExactArtifactGraph([result], {
				packageRoot: root,
				sourceRoot: path.join(root, 'src'),
				rootDir: root
			}).clientIslands
		).toEqual([]);
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
		const page = artifactAnalysis(result).components.find(
			(component) => component.name === 'Page'
		)!;
		const widget = artifactAnalysis(result).components.find(
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
				placement: 'isomorphic',
				boundary: 'isomorphic',
				index: 1,
				path: expect.any(String)
			}
		]);
	});

	it('renders a static server shell around finite client ranges', async () => {
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
		const islands = artifactAnalysis(result).symbols.filter(
			(symbol) => symbol.role === 'client-island'
		);

		expect(artifactAnalysis(result).components[0]!.clientIslandCount).toBe(2);
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
		expect(client).toMatch(/export const Panel = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/);
		expect(client).not.toContain('export function Panel_ExactClient_1');
		expect(client).not.toContain('export function Panel_ExactClient_2');
		expect(server).not.toContain('createServerBoundary as');
		expect(server).toContain(
			'const __exactImplementation_Panel_1 = function Panel(this: Component<'
		);
		expect(server).toContain('artifact:');
		expect(server).toContain('instantiate: __exactImplementation_Panel_1');
		expect(server).toContain('export { Panel as Panel_ExactServer_1 }');
		expect(server).not.toContain('statePaths: [');
		expect(server).toContain('state: [');
		expect(server).toContain('"count"');
		expect(server).toContain(
			'__exactSsr.rootOpening(__exactContext, __exactOutput, __exactValue_0, "section", "<section", "><button class=\\"primary\\""'
		);
		expect(server).toContain('[{}, this.state.count, true, this.state.count]');
		expect(server).toContain('__exactSsr.compiledAttribute(');
		expect(server).not.toContain('onClick');
		expect(
			artifactAnalysis(result)
				.boundaries.filter((boundary) => boundary.kind === 'client-island')
				.map((boundary) => boundary.name)
		).toEqual(['Panel_ExactClient_1', 'Panel_ExactClient_2']);
	});

	it('infers arbitrary dynamic client island props in isomorphic server artifacts', () => {
		const output = transform(
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        const label = String(this.state.count);\n        return () => <button title={label} onClick={() => this.state.count++} />;\n      }\n    ',
			{ filename: 'Panel.tsx', target: 'server', serverComponents: true }
		);

		expect(output).toContain('title: label');
		expect(output).toContain('"__exactState": { count: this.state.count }');
		expect(output).toContain('Panel_ExactClient_1');
		expect(output).not.toContain('onClick');
	});

	it('infers aliased state reads for client island snapshots', () => {
		const output = transform(
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ project: { title: string } }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        const project = this.state.project;\n        return () => <button title={project.title} onClick={() => project.title = "Updated"} />;\n      }\n    ',
			{ filename: 'Panel.tsx', target: 'server', serverComponents: true }
		);

		expect(output).toContain('"__exactState": { project: { title: this.state.project.title } }');
		expect(output).toContain('title: project.get().title');
		expect(output).not.toContain('onClick');
	});

	it('retains whole-object snapshots when a state alias is consumed as a value', () => {
		const output = transform(
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ project: { title: string } }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        const project = this.state.project;\n        return () => <button title={String(project)} onClick={() => save(project)} />;\n      }\n    ',
			{ filename: 'Panel.tsx', target: 'server', serverComponents: true }
		);

		expect(output).toContain('"__exactState": { project: this.state.project }');
		expect(output).not.toContain('onClick');
	});

	it('infers derived state reads for client island snapshots', () => {
		const output = transform(
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ project: { title: string; owner: string } }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("panel.txt", "utf8");\n        };\nrunFixtureTask();\n        const title = this.state.project.title;\n        const label = `${title} by ${this.state.project.owner}`;\n        return () => <button title={label} onClick={() => this.state.project.title = "Updated"}>{label}</button>;\n      }\n    ',
			{ filename: 'Panel.tsx', target: 'server', serverComponents: true }
		);

		expect(output).toContain(
			'"__exactState": { project: { owner: this.state.project.owner, title: this.state.project.title } }'
		);
		expect(output).toContain('title: label');
		expect(output).not.toContain('onClick');
	});
});
