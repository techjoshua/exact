import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	analyzeSource,
	compileFileArtifacts,
	compileProjectArtifacts,
	transform
} from '../../index.js';
import { createTestWorkspace } from '../../test-support/workspace.js';

describe('@exact/compiler: islands', () => {
	it('generates child-bearing client island components with state bridge props', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number; label: string }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <button title={this.state.label} onClick={() => this.state.count++}>
          Save {this.state.count}
        </button>;
      }
    `;
		const client = transform(source, { filename: 'Panel.tsx', target: 'client' });
		const server = transform(source, { filename: 'Panel.tsx', target: 'server' });

		expect(client).toContain('export function Panel_ExactClient_1(this: any, props: any = {})');
		expect(client).toContain('title: props.title');
		expect(client).toContain('onClick: () => this.state.count++');
		expect(client).toContain('__exactDynamic(() => this.state.count)');
		expect(server).toContain(
			'"__exactState": { count: this.state.count, label: this.state.label }'
		);
		expect(server).toContain('title: this.state.label');
		expect(server).not.toContain('onClick');
	});

	it('bridges owner-local captures into generated client islands', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const label = String(this.state.count);
        return () => <button onClick={() => console.log(label)}>
          {label}
        </button>;
      }
    `;
		const client = transform(source, { filename: 'Panel.tsx', target: 'client' });
		const server = transform(source, { filename: 'Panel.tsx', target: 'server' });

		expect(server).toContain('"__exactCapture": { label: label }');
		expect(client).toContain('console.log(props.__exactCapture.label)');
		expect(client).toContain('__exactDynamic(() => props.__exactCapture.label)');
	});

	it('does not capture shadowed client island identifiers', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const label = String(this.state.count);
        return () => <button onClick={(label) => console.log(label)}>Save</button>;
      }
    `;
		const client = transform(source, { filename: 'Panel.tsx', target: 'client' });
		const server = transform(source, { filename: 'Panel.tsx', target: 'server' });

		expect(server).not.toContain('__exactCapture');
		expect(client).toContain('onClick: (label) => console.log(label)');
		expect(client).not.toContain('props.__exactCapture.label');
	});

	it('bridges component-local function captures into generated client islands', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        function save() {
          this.state.count++;
        }
        return () => <button onClick={() => save()}>Save</button>;
      }
    `;
		const client = transform(source, { filename: 'Panel.tsx', target: 'client' });
		const server = transform(source, { filename: 'Panel.tsx', target: 'server' });

		expect(server).not.toContain('__exactCapture');
		expect(client).toContain('function save()');
		expect(client).toContain('onClick: () => save()');
	});

	it('clones component-local arrow function captures into generated client islands', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        const save = () => this.state.count++;
        return () => <button onClick={() => save()}>Save</button>;
      }
    `;
		const client = transform(source, { filename: 'Panel.tsx', target: 'client' });
		const server = transform(source, { filename: 'Panel.tsx', target: 'server' });

		expect(server).not.toContain('__exactCapture');
		expect(client).toContain('const save = () => this.state.count++;');
		expect(client).toContain('onClick: () => save()');
	});

	it('does not generate nested client islands inside an extracted element island', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <section onClick={() => this.state.count++}>
          <button onClick={() => this.state.count++}>Nested</button>
        </section>;
      }
    `;
		const manifest = analyzeSource(source, { filename: 'Panel.tsx' });
		const client = transform(source, { filename: 'Panel.tsx', target: 'client' });
		const server = transform(source, { filename: 'Panel.tsx', target: 'server' });

		expect(manifest.components[0]!.clientIslandCount).toBe(1);
		expect(client).toContain('export function Panel_ExactClient_1(this: any, props: any = {})');
		expect(client).not.toContain('export function Panel_ExactClient_2');
		expect(server).toContain('Panel_ExactClient_1');
		expect(server).not.toContain('Panel_ExactClient_2');
	});

	it('keeps server-only child subgraphs server-owned inside generated element islands', () => {
		const source = `
      import { readFile } from "node:fs/promises";

      function ServerSummary(this: Component<{ title: string }>) {
        this.task.server(async () => {
          this.state.title = await readFile("summary.txt", "utf8");
        });
        return () => <p>{this.state.title}</p>;
      }

      export function Panel(this: Component<{ count: number }>) {
        this.state.count = 0;
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <section onClick={() => this.state.count++}>
          <div className="summary"><ServerSummary /></div>
        </section>;
      }
    `;
		const manifest = analyzeSource(source, { filename: 'Panel.tsx' });
		const client = transform(source, {
			filename: 'Panel.tsx',
			target: 'client',
			serverComponents: true
		});
		const server = transform(source, {
			filename: 'Panel.tsx',
			target: 'server',
			serverComponents: true
		});

		expect(
			manifest.components.find((component) => component.name === 'Panel')!.clientIslandCount
		).toBe(1);
		expect(manifest.boundaries).toContainEqual(
			expect.objectContaining({
				name: 'Panel_ExactClient_1:children',
				kind: 'server-slot'
			})
		);
		expect(client).toContain('export function Panel_ExactClient_1(this: any, props: any = {})');
		expect(client).toContain('props.children');
		expect(client).not.toContain('ServerSummary');
		expect(client).not.toContain('readFile');
		expect(server).toContain('__exactBoundary');
		expect(server).toContain('Panel_ExactClient_1');
		expect(server).toContain('__exactVNode("div"');
		expect(server).toContain('__exactVNode(ServerSummary');
		expect(server).toContain('readFile');
	});

	it('keeps imported server child subgraphs server-owned inside generated element islands', () => {
		const childManifest = analyzeSource(
			`
      import { readFile } from "node:fs/promises";

      export function ServerSummary(this: Component<{ title: string }>) {
        this.task.server(async () => {
          this.state.title = await readFile("summary.txt", "utf8");
        });
        return () => <p>{this.state.title}</p>;
      }
    `,
			{ filename: '/pkg/ServerSummary.tsx' }
		);
		const source = `
      import { readFile } from "node:fs/promises";
      import { ServerSummary } from "./ServerSummary";

      export function Panel(this: Component<{ count: number }>) {
        this.state.count = 0;
        this.task.server(async () => {
          await readFile("panel.txt", "utf8");
        });
        return () => <section onClick={() => this.state.count++}>
          <div className="summary"><ServerSummary /></div>
        </section>;
      }
    `;
		const client = transform(source, {
			filename: '/pkg/Panel.tsx',
			target: 'client',
			serverComponents: true,
			importedManifests: [childManifest]
		});
		const server = transform(source, {
			filename: '/pkg/Panel.tsx',
			target: 'server',
			serverComponents: true,
			importedManifests: [childManifest]
		});

		expect(client).toContain('export function Panel_ExactClient_1(this: any, props: any = {})');
		expect(client).toContain('props.children');
		expect(client).not.toContain('ServerSummary');
		expect(server).toContain('__exactVNode(ServerSummary');
		expect(server).toContain('from "./ServerSummary"');
	});

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
			/export const ClientWidget: typeof __exactImplementation_ClientWidget_\d+ = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/
		);
		expect(client).toMatch(/\["[^"]+", "ClientWidget", __exactImplementation_ClientWidget_\d+\]/);
		expect(client).toContain('window.innerWidth');
		expect(server).toContain('__exactBoundary');
		expect(server).toContain('"ClientWidget"');
		expect(server).toContain('title: this.state.title');
		expect(server).not.toContain('window.innerWidth');
		expect(server).not.toContain('onClick');
		expect(result.manifest.boundaries).toContainEqual(
			expect.objectContaining({
				id: expect.any(String),
				name: 'ClientWidget',
				componentId: expect.any(String),
				ownerComponentId: result.manifest.components.find((component) => component.name === 'Page')!
					.id,
				kind: 'client-island'
			})
		);
		expect(result.manifest.artifacts?.boundaries).toEqual(result.manifest.boundaries);
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

		expect(server).toContain('export function ClientWidget(props = {})');
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
		expect(server).toContain('__exactVNode("p"');
		expect(server).toContain('"Server child"');
		expect(server).not.toContain('window.innerWidth');
	});

	it('emits manifest boundaries for refreshable server child slots', () => {
		const manifest = analyzeSource(
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

		const slotBoundary = manifest.boundaries.find(
			(boundary) => boundary.name === 'ClientShell:children' && boundary.kind === 'server-slot'
		);
		expect(slotBoundary).toBeDefined();
		expect(manifest.boundaries).toContainEqual(
			expect.objectContaining({
				id: slotBoundary!.id.slice(0, -':children'.length),
				name: 'ClientShell',
				componentId: slotBoundary!.componentId,
				ownerComponentId: slotBoundary!.ownerComponentId,
				kind: 'client-island'
			})
		);
		expect(
			manifest.boundaries.filter(
				(boundary) => boundary.name === 'ClientShell:children' && boundary.kind === 'server-slot'
			)
		).toHaveLength(1);
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
		const manifest = analyzeSource(source, { filename: 'Page.tsx' });
		const server = transform(source, { filename: 'Page.tsx', target: 'server' });

		const slotBoundaries = manifest.boundaries.filter(
			(boundary) => boundary.name === 'ClientShell:children' && boundary.kind === 'server-slot'
		);
		const slottedClientBoundaryIds = slotBoundaries.map((boundary) =>
			boundary.id.slice(0, -':children'.length)
		);
		const slottedClientBoundaries = manifest.boundaries.filter((boundary) =>
			slottedClientBoundaryIds.includes(boundary.id)
		);
		const emittedBoundaryIds = Array.from(
			server.matchAll(/__exactBoundary\("([^"]+)", "ClientShell"/g),
			(match) => match[1]
		);
		const page = manifest.components.find((component) => component.name === 'Page')!;

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
		expect(server).toContain('children: ["Issue", this.state.title, "#", this.state.count]');
		expect(server).not.toContain('window.innerWidth');
	});

	it('fails clearly when a generated client island references server-only imports', () => {
		expect(() =>
			transform(
				`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ count: number }>) {
        this.task.server(async () => {
          this.state.count = 1;
        });
        return () => <button onClick={() => readFile("secret.txt", "utf8")}>Read</button>;
      }
    `,
				{ filename: 'Panel.tsx', target: 'server' }
			)
		).toThrow('client island cannot reference server-only imports');
	});

	it('fails clearly when isomorphic server-rendered code references browser globals outside a client island', () => {
		expect(() =>
			transform(
				`
      import { readFile } from "node:fs/promises";

      export function Panel(this: Component<{ title: string }>) {
        this.task.server(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        return () => <p>{window.innerWidth}</p>;
      }
    `,
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

	it('splits imported client components using project manifests', async () => {
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
		expect(server).toContain('__exactVNode("p"');
		expect(server).toContain('"Server child"');
		expect(server).not.toContain('from "./ClientWidget"');
		expect(server).not.toContain('window.innerWidth');
		expect(page.manifest.boundaries).toContainEqual(
			expect.objectContaining({
				name: 'ClientWidget',
				componentId: widget.manifest.components[0]!.id,
				kind: 'client-island'
			})
		);
		expect(page.manifest.boundaries).toContainEqual(
			expect.objectContaining({
				name: 'ClientWidget:children',
				componentId: widget.manifest.components[0]!.id,
				kind: 'server-slot'
			})
		);
	});
});
