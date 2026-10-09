import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { createInstalledIslandsFixture } from '../../../../framework-adapters/test-support/installed-islands.js';
import {
	compileFileArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule,
	transform
} from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { artifactAnalysis } from '../compilation/analysis-results.js';

describe('@exactjs/compiler: registries', () => {
	it('discovers activation owners reached through enhancement edges', async () => {
		const fixture = await createInstalledIslandsFixture(false);
		onTestFinished(fixture.dispose);
		const inputFile = path.join(fixture.root, 'ScopePage.tsx');
		await writeFile(
			inputFile,
			"import {ControlScope} from '@fixture/islands'; /** @exact server */ export function Page(){return()=> <ControlScope initial={3}/>;}"
		);
		const result = await compileFileArtifacts(inputFile, {
			outDir: path.join(fixture.root, 'scope-generated'),
			rootDir: fixture.root,
			serverComponents: true
		});
		const options = { packageRoot: fixture.root, rootDir: fixture.root };
		const edge = {
			identity: '@fixture/islands#LocalCounter',
			moduleSpecifier: '@fixture/islands',
			exportName: 'LocalCounter'
		};
		const enhancementOnly = {
			...result,
			build: {
				...result.build,
				componentBuild: {
					...result.build.componentBuild,
					componentImports: [],
					rendererEnhancements: [edge]
				}
			}
		};
		expect(createExactArtifactGraph([enhancementOnly], options).clientIslands).toContainEqual(
			expect.objectContaining({ exportName: 'LocalCounter', module: '@fixture/islands' })
		);
		const file = path.join(
			fixture.root,
			'node_modules/@fixture/islands/dist/exact-component-build.json'
		);
		const published = JSON.parse(await readFile(file, 'utf8'));
		for (const module of published.modules)
			if (module.path.endsWith('/ControlScope.js')) module.facts.rendererEnhancements.push(edge);
		await writeFile(file, JSON.stringify(published));
		expect(createExactArtifactGraph([result], options).clientIslands).toContainEqual(
			expect.objectContaining({ exportName: 'LocalCounter', module: '@fixture/islands' })
		);
		const module = published.modules.find((entry: { path: string }) =>
			entry.path.endsWith('/ControlScope.js')
		);
		module.facts.rendererEnhancements.push({ ...edge, moduleSpecifier: 123 });
		await writeFile(file, JSON.stringify(published));
		expect(() => createExactArtifactGraph([result], options)).toThrow(/import edge/);
	}, 60_000);

	it('discovers an independently built library activation owner without manual registration', async () => {
		const fixture = await createInstalledIslandsFixture(false);
		onTestFinished(fixture.dispose);
		const result = await compileFileArtifacts(path.join(fixture.root, 'Page.tsx'), {
			outDir: path.join(fixture.root, 'generated'),
			rootDir: fixture.root,
			serverComponents: true
		});
		const graph = createExactArtifactGraph([result], {
			packageRoot: fixture.root,
			rootDir: fixture.root
		});
		expect(graph.clientIslands).toContainEqual(
			expect.objectContaining({ exportName: 'LocalCounter', module: '@fixture/islands' })
		);
		expect(graph.clientIslands).toContainEqual(
			expect.objectContaining({ exportName: 'InstalledCounter', module: '@fixture/islands' })
		);
		expect(graph.clientIslands).toContainEqual(
			expect.objectContaining({
				exportName: 'Row',
				module: './node_modules/@fixture/islands/dist/client/Row.js'
			})
		);
		expect(graph.operations).toHaveLength(3);
		expect(graph.serverParts.length).toBeGreaterThan(0);
		await symlink(
			path.join(fixture.root, 'node_modules/@fixture/islands'),
			path.join(fixture.root, 'node_modules/fixture-alias'),
			'junction'
		);
		const aliasSource = path.join(fixture.root, 'AliasPage.tsx');
		await writeFile(
			aliasSource,
			"import {LocalCounter} from 'fixture-alias'; /** @exact server */ export function AliasPage(){return()=> <ul><LocalCounter/></ul>;}"
		);
		const alias = await compileFileArtifacts(aliasSource, {
			rootDir: fixture.root,
			outDir: path.join(fixture.root, 'alias-generated'),
			serverComponents: true
		});
		const aliasedGraph = createExactArtifactGraph([alias], {
			packageRoot: fixture.root,
			rootDir: fixture.root
		});
		expect(aliasedGraph.clientIslands).toContainEqual(
			expect.objectContaining({ exportName: 'LocalCounter', module: 'fixture-alias' })
		);
		const file = path.join(
			fixture.root,
			'node_modules/@fixture/islands/dist/exact-component-build.json'
		);
		const published = JSON.parse(await readFile(file, 'utf8'));
		const module = published.modules.find(
			(entry: { path: string }) => entry.path === 'dist/server/LocalCounter.js'
		);
		const original = module.artifacts.clientModule;
		for (const invalid of [
			'../outside.js',
			'C:outside.js',
			'c:../outside.js',
			'C:/outside.js',
			'C:\\outside.js'
		]) {
			module.artifacts.clientModule = invalid;
			await writeFile(file, JSON.stringify(published));
			expect(() =>
				createExactArtifactGraph([result], { packageRoot: fixture.root, rootDir: fixture.root })
			).toThrow(/artifact module path/);
		}
		module.artifacts.clientModule = original;
		module.artifacts.clientModule = 'dist/client/work.js';
		await writeFile(file, JSON.stringify(published));
		expect(() =>
			createExactArtifactGraph([result], { packageRoot: fixture.root, rootDir: fixture.root })
		).toThrow(/paired artifact module owner/);
		module.artifacts.clientModule = original;

		const registration = module.artifacts.build.clientRegistrations[0];
		for (const field of ['id', 'name', 'exportName']) {
			const saved = registration[field];
			registration[field] = 123;
			await writeFile(file, JSON.stringify(published));
			expect(() =>
				createExactArtifactGraph([result], { packageRoot: fixture.root, rootDir: fixture.root })
			).toThrow(/registration owner/);
			registration[field] = saved;
		}
		published.modules.push(module);
		await writeFile(file, JSON.stringify(published));
		expect(() =>
			createExactArtifactGraph([result], { packageRoot: fixture.root, rootDir: fixture.root })
		).toThrow(/duplicate module/);
		published.modules.pop();
		module.artifacts.build.clientRegistrations[0].componentId = 'foreign-owner';
		await writeFile(file, JSON.stringify(published));
		expect(() =>
			createExactArtifactGraph([result], { packageRoot: fixture.root, rootDir: fixture.root })
		).toThrow(/registration owner/);
	}, 60000);
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
		expect(module).toContain('.then((module) => Reflect.get(module, "Panel_ExactClient_1"))');
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
		expect(module).toContain('.then((module) => Reflect.get(module, "Workspace"))');
	});

	it('registers local activation owners without server operations', async () => {
		const root = await createTestWorkspace('exact-local-activation-registration-');
		const input = path.join(root, 'src', 'Counter.tsx');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`export function Counter(this:{state:{count:number}}){this.state.count=0;return()=> <button onClick={()=>this.state.count++}>{this.state.count}</button>;}`
		);
		const result = await compileFileArtifacts(input, {
			outDir: path.join(root, 'dist'),
			rootDir: path.join(root, 'src')
		});
		expect(result.build.operations).toEqual([]);
		expect(result.build.clientRegistrations).toContainEqual(
			expect.objectContaining({ exportName: 'Counter' })
		);
		const graph = createExactArtifactGraph([result], {
			packageRoot: root,
			sourceRoot: path.join(root, 'src'),
			rootDir: root
		});
		expect(createExactHydrationRegistrationModule(graph)).toContain(
			'.then((module) => Reflect.get(module, "Counter"))'
		);
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
		expect(client).toMatch(
			/export const Panel = \/\* @__PURE__ \*\/ \(\(\) => __exactBrandComponent_\d+/
		);
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
		expect(server).toContain('__exactSsr.rootOpening(');
		for (const boundary of artifactAnalysis(result).boundaries)
			for (const target of boundary.activation?.targets ?? []) expect(server).toContain(target.id);
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

it('retains supported replay targets when another event requires eager island loading', async () => {
	const root = await createTestWorkspace('exact-eager-replay-');
	const input = path.join(root, 'page.tsx');
	await writeFile(
		input,
		`import { type Component } from '@exactjs/core';
export function Page(this: Component<{value: string}>) {
 this.state.value = 'system';
 return () => <section onKeyDown={() => {}}>
 <select value={this.state.value} onChange={event => { this.state.value = event.currentTarget.value; }}>
 <option value="system">System</option><option value="light">Light</option></select>
 <output>{this.state.value}</output></section>;
}`
	);
	const result = await compileFileArtifacts(input, {
		rootDir: root,
		outDir: path.join(root, 'out')
	});
	const boundary = artifactAnalysis(result).boundaries.find((entry) =>
		entry.activation?.targets.some((target) =>
			target.events.some((event) => event.type === 'change')
		)
	);
	expect(boundary?.activation).toMatchObject({
		mode: 'eager',
		reasons: expect.arrayContaining([expect.objectContaining({ code: 'unsupported-event' })])
	});
	const graph = createExactArtifactGraph([result], {
		rootDir: root,
		sourceRoot: root,
		packageRoot: root
	});
	const registration = createExactHydrationRegistrationModule(graph);
	expect(registration).toContain('"mode":"eager"');
	for (const target of boundary!.activation!.targets)
		expect(registration).toContain(JSON.stringify(target));
});
