import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileFileArtifacts, compileProjectArtifacts, transform } from '../../index.js';
import { analyzeSource } from '../../compilation/source-analysis.js';
import { createTestWorkspace } from '../../test-support/workspace.js';
import { artifactAnalysis } from '../../compilation/analysis-results.js';

describe('@exactjs/compiler: island boundaries', () => {
	it('splits self-closing client components out of server artifacts', async () => {
		const root = await createTestWorkspace('exact-component-split-');
		const input = path.join(root, 'src', 'page.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      export function ClientWidget(this: Component<{ width: number }>, props: { title: string }) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++}>{props.title}</button>;
      }

      export function Page(this: Component<{ title: string }>) {
        this.state.title = "Ready";
        return () => <section><ClientWidget title={this.state.title} /></section>;
      }
    `
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const client = await readFile(result.clientFile, 'utf8');
		const server = await readFile(result.serverFile, 'utf8');

		expect(client).toMatch(
			/export const ClientWidget = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/
		);
		expect(client).toMatch(
			/\{ id: "[^"]+", name: "ClientWidget", role: "root", implementation: __exactImplementation_ClientWidget_\d+ \}/
		);
		expect(client).toContain('window.innerWidth');
		expect(server).toContain('__exactBoundary');
		expect(server).toContain('"ClientWidget"');
		expect(server).toContain('title: this.state.title');
		expect(server).not.toContain('window.innerWidth');
		expect(server).not.toContain('onClick');
		expect(artifactAnalysis(result).boundaries).toContainEqual(
			expect.objectContaining({
				id: expect.any(String),
				name: 'ClientWidget',
				componentId: expect.any(String),
				ownerComponentId: artifactAnalysis(result).components.find(
					(component) => component.name === 'Page'
				)!.id,
				kind: 'client-island'
			})
		);
	});

	it('emits server-safe boundary stubs for client components', () => {
		const server = transform(
			`
      export function ClientWidget(this: Component<{ width: number }>, props: { title: string }) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++}>{props.title}</button>;
      }
    `,
			{ filename: 'ClientWidget.tsx', target: 'server' }
		);

		expect(server).toContain(
			'const __exactImplementation_ClientWidget_1 = function ClientWidget(props = {})'
		);
		expect(server).toContain('artifact:');
		expect(server).toContain('instantiate: __exactImplementation_ClientWidget_1');
		expect(server).toContain('__exactBoundary');
		expect(server).toContain('"ClientWidget"');
		expect(server).not.toContain('window.innerWidth');
		expect(server).not.toContain('onClick');
	});

	it('splits client components with JSX children into server boundary children', () => {
		const server = transform(
			`
      export function ClientShell(this: Component<{ width: number }>, props: { children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <section>{props.children}</section>;
      }

      export function Page() {
        return () => <ClientShell><p>Server child</p></ClientShell>;
      }
    `,
			{ target: 'server' }
		);

		expect(server).toContain('__exactBoundary');
		expect(server).toContain('"ClientShell"');
		expect(server).toContain('attachmentTag: "p"');
		expect(server).not.toContain('__exactVNode("p"');
		expect(server).toContain('__exactSsr.static(__exactOutput, "<p")');
		expect(server).toContain('__exactSsr.static(__exactOutput, ">Server child</p>")');
		expect(server).not.toContain('window.innerWidth');
	});

	it('emits analysis boundaries for refreshable server child slots', () => {
		const analysis = analyzeSource(
			`
      export function ClientShell(this: Component<{ width: number }>, props: { children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <section>{props.children}</section>;
      }

      export function Page() {
        return () => <>
          <ClientShell><p>Server child</p></ClientShell>
          <ClientShell>Text child</ClientShell>
        </>;
      }
    `,
			{ filename: 'Page.tsx' }
		);

		const slotBoundary = analysis.boundaries.find(
			(boundary) => boundary.name === 'ClientShell:children' && boundary.kind === 'server-slot'
		);
		expect(slotBoundary).toBeDefined();
		expect(analysis.boundaries).toContainEqual(
			expect.objectContaining({
				id: slotBoundary!.id.slice(0, -':children'.length),
				name: 'ClientShell',
				componentId: slotBoundary!.componentId,
				ownerComponentId: slotBoundary!.ownerComponentId,
				kind: 'client-island'
			})
		);
		expect(
			analysis.boundaries.filter(
				(boundary) => boundary.name === 'ClientShell:children' && boundary.kind === 'server-slot'
			)
		).toHaveLength(1);
	});

	it('projects independent recursive server ranges through native module analysis', () => {
		const analysis = analyzeSource(
			`
      import { TaskContext } from "@exactjs/core";
      function ServerSummary() {
        const load = async (_task: TaskContext = TaskContext.server()) => fetchSummary();
        load();
        return () => <p>Summary</p>;
      }
      function ServerPermissions() {
        const load = async (_task: TaskContext = TaskContext.server()) => fetchPermissions();
        load();
        return () => <p>Permissions</p>;
      }
      export function Workspace(this: Component<{ editing: boolean }>) {
        return () => (
          <section onClick={() => this.state.editing = true}>
            <ServerSummary />
            <button>Edit</button>
            <ServerPermissions />
          </section>
        );
      }
    `,
			{ filename: 'PartitionSiblings.tsx' }
		);
		const serverRanges = analysis.partitionPlan.edges.filter(
			(edge) => edge.kind === 'server-range'
		);

		expect(analysis.partitionPlan.version).toBe(1);
		expect(serverRanges).toHaveLength(2);
		expect(serverRanges[0]!.parent).toBe(serverRanges[1]!.parent);
		expect(serverRanges[0]!.child).not.toBe(serverRanges[1]!.child);
		expect(
			analysis.partitionPlan.nodes.find((node) => node.id === serverRanges[0]!.parent)
		).toMatchObject({
			kind: 'region',
			placement: 'client',
			activation: 'interaction',
			activationDecision: { mode: 'interaction', reasons: [] }
		});
	});

	it('uses distinct boundaries for repeated client component tag instances', () => {
		const source = `
      export function ClientShell(this: Component<{ width: number }>, props: { children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <section>{props.children}</section>;
      }

      export function Page() {
        return () => <>
          <ClientShell><p>First</p></ClientShell>
          <ClientShell><p>Second</p></ClientShell>
        </>;
      }
    `;
		const analysis = analyzeSource(source, { filename: 'Page.tsx' });
		const server = transform(source, { filename: 'Page.tsx', target: 'server' });

		const slotBoundaries = analysis.boundaries.filter(
			(boundary) => boundary.name === 'ClientShell:children' && boundary.kind === 'server-slot'
		);
		const slottedClientBoundaryIds = slotBoundaries.map((boundary) =>
			boundary.id.slice(0, -':children'.length)
		);
		const slottedClientBoundaries = analysis.boundaries.filter((boundary) =>
			slottedClientBoundaryIds.includes(boundary.id)
		);
		const emittedBoundaryIds = Array.from(
			server.matchAll(/__exactBoundary\("([^"]+)", "ClientShell"/g),
			(match) => match[1]
		);
		const page = analysis.components.find((component) => component.name === 'Page')!;

		expect(slotBoundaries).toHaveLength(2);
		expect(slottedClientBoundaries).toHaveLength(2);
		expect(new Set(slottedClientBoundaryIds).size).toBe(2);
		expect(slottedClientBoundaries.map((boundary) => boundary.renderEdgeId)).toEqual(
			page.renderEdges.map((edge) => edge.id)
		);
		expect(slottedClientBoundaries.map((boundary) => boundary.renderEdgeIndex)).toEqual([1, 2]);
		expect(slotBoundaries.map((boundary) => boundary.renderEdgeId)).toEqual(
			slottedClientBoundaries.map((boundary) => boundary.renderEdgeId)
		);
		expect(slotBoundaries.map((boundary) => boundary.renderPath)).toEqual(
			slottedClientBoundaries.map((boundary) => boundary.renderPath)
		);
		expect(slotBoundaries.map((boundary) => boundary.id).sort()).toEqual(
			slottedClientBoundaries.map((boundary) => `${boundary.id}:children`).sort()
		);
		expect(emittedBoundaryIds.filter((id) => slottedClientBoundaryIds.includes(id))).toEqual(
			slottedClientBoundaries.map((boundary) => boundary.id)
		);
	});

	it('splits client components with text-only children into serializable island props', () => {
		const server = transform(
			`
      export function ClientShell(this: Component<{ width: number }>, props: { children?: string }) {
        this.state.width = window.innerWidth;
        return () => <section>{props.children}</section>;
      }

      export function Page() {
        return () => <ClientShell>Server child</ClientShell>;
      }
    `,
			{ target: 'server' }
		);

		expect(server).toContain('__exactBoundary');
		expect(server).toContain('children: "Server child"');
		expect(server).not.toContain('window.innerWidth');
	});

	it('splits client components with expression children into serializable island props', () => {
		const server = transform(
			`
      export function ClientShell(this: Component<{ width: number }>, props: { children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <section>{props.children}</section>;
      }

      export function Page(this: Component<{ title: string; count: number }>) {
        return () => <ClientShell>Issue {this.state.title} #{this.state.count}</ClientShell>;
      }
    `,
			{ target: 'server' }
		);

		expect(server).toContain('__exactBoundary');
		expect(server).toContain('children: ["Issue ", this.state.title, " #", this.state.count]');
		expect(server).not.toContain('window.innerWidth');
	});

	it('fails clearly when a generated client island references server-only imports', () => {
		expect(() =>
			transform(
				'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ count: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          this.state.count = 1;\n        };\nrunFixtureTask();\n        return () => <button onClick={() => readFile("secret.txt", "utf8")}>Read</button>;\n      }\n    ',
				{ filename: 'Panel.tsx', target: 'server' }
			)
		).toThrow('client island cannot reference server-only imports');
	});

	it('fails clearly when isomorphic server-rendered code references browser globals outside a client island', () => {
		expect(() =>
			transform(
				'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n\n      export function Panel(this: Component<{ title: string }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          this.state.title = await readFile("title.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <p>{window.innerWidth}</p>;\n      }\n    ',
				{ filename: 'Panel.tsx', target: 'server' }
			)
		).toThrow('browser-only global window cannot be used in server-rendered component code');
	});

	it('allows browser globals in pure client components that become server stubs', () => {
		const server = transform(
			`
      export function Panel() {
        return () => <p>{window.innerWidth}</p>;
      }
    `,
			{ filename: 'Panel.tsx', target: 'server' }
		);

		expect(server).toContain('__exactBoundary');
		expect(server).not.toContain('window.innerWidth');
	});

	it('removes imports used only by split client components from server artifacts', async () => {
		const root = await createTestWorkspace('exact-prune-imports-');
		const input = path.join(root, 'src', 'page.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			`
      import { Chart } from "chart-lib";

      export function ClientChart(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => Chart.render()} />;
      }

      export function Page() {
        return () => <ClientChart />;
      }
    `
		);

		const result = await compileFileArtifacts(input, {
			outDir,
			rootDir: path.join(root, 'src')
		});
		const client = await readFile(result.clientFile, 'utf8');
		const server = await readFile(result.serverFile, 'utf8');

		expect(client).toContain('chart-lib');
		expect(server).not.toContain('chart-lib');
		expect(server).not.toContain('Chart.render');
		expect(server).toContain('"ClientChart"');
	});

	it('splits imported client components using project-session analysis', async () => {
		const root = await createTestWorkspace('exact-imported-component-split-');
		const srcDir = path.join(root, 'src');
		const outDir = path.join(root, 'out');
		const widgetFile = path.join(srcDir, 'ClientWidget.tsx');
		const pageFile = path.join(srcDir, 'Page.tsx');
		await mkdir(srcDir, { recursive: true });
		await writeFile(
			widgetFile,
			`
      export function ClientWidget(this: Component<{ width: number }>, props: { title: string; children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++}>{props.title}{props.children}</button>;
      }
    `
		);
		await writeFile(
			pageFile,
			`
      import { ClientWidget } from "./ClientWidget";

      export function Page(this: Component<{ title: string }>) {
        this.state.title = "Ready";
        return () => <section><ClientWidget title={this.state.title}><p>Server child</p></ClientWidget></section>;
      }
    `
		);

		const results = await compileProjectArtifacts([srcDir], {
			outDir,
			rootDir: srcDir
		});
		const page = results.find((result) => result.inputFile === pageFile)!;
		const widget = results.find((result) => result.inputFile === widgetFile)!;
		const server = await readFile(page.serverFile, 'utf8');

		expect(server).toContain('__exactBoundary');
		expect(server).toContain('"ClientWidget"');
		expect(server).toContain('title: this.state.title');
		expect(server).toContain('attachmentTag: "p"');
		expect(server).not.toContain('__exactVNode("p"');
		expect(server).toContain('__exactSsr.static(__exactOutput, "<p")');
		expect(server).toContain('__exactSsr.static(__exactOutput, ">Server child</p>")');
		expect(server).not.toContain('from "./ClientWidget"');
		expect(server).not.toContain('window.innerWidth');
		expect(artifactAnalysis(page).boundaries).toContainEqual(
			expect.objectContaining({
				name: 'ClientWidget',
				componentId: artifactAnalysis(widget).components[0]!.id,
				kind: 'client-island'
			})
		);
		expect(artifactAnalysis(page).boundaries).toContainEqual(
			expect.objectContaining({
				name: 'ClientWidget:children',
				componentId: artifactAnalysis(widget).components[0]!.id,
				kind: 'server-slot'
			})
		);
	});
});
