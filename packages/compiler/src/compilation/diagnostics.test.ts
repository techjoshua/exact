import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSource, compileProject, generatedComponentName, transform } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';

describe('@exact/compiler: diagnostics', () => {
	it('does not split an imported client component when a local binding shadows it', () => {
		const widgetManifest = analyzeSource(
			`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `,
			{ filename: '/src/ClientWidget.tsx' }
		);
		const source = `
      import { ClientWidget } from "./ClientWidget";

      export function Page() {
        const ClientWidget = "local";
        return () => <section><ClientWidget /></section>;
      }
    `;
		const manifest = analyzeSource(source, {
			filename: '/src/Page.tsx',
			importedManifests: [widgetManifest]
		});

		expect(manifest.boundaries.filter((boundary) => boundary.name === 'ClientWidget')).toHaveLength(
			0
		);
		expect(manifest.components[0]!.renderEdges).toEqual([]);
		expect(manifest.components[0]!.diagnostics).toContain(
			'error: JSX tag ClientWidget resolves to variable, not a runtime component'
		);
		expect(() =>
			transform(source, {
				filename: '/src/Page.tsx',
				target: 'server',
				importedManifests: [widgetManifest]
			})
		).toThrow('JSX tag ClientWidget resolves to variable');
	});

	it('does not split type-only imported component names', () => {
		const widgetManifest = analyzeSource(
			`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `,
			{ filename: '/src/ClientWidget.tsx' }
		);
		const source = `
      import type { ClientWidget } from "./ClientWidget";

      export function Page() {
        return () => <section><ClientWidget /></section>;
      }
    `;
		const manifest = analyzeSource(source, {
			filename: '/src/Page.tsx',
			importedManifests: [widgetManifest]
		});

		expect(manifest.boundaries.filter((boundary) => boundary.name === 'ClientWidget')).toHaveLength(
			0
		);
		expect(manifest.components[0]!.renderEdges).toEqual([]);
		expect(manifest.components[0]!.diagnostics).toContain(
			'error: JSX tag ClientWidget resolves to a type-only import and cannot be rendered at runtime'
		);
		expect(() =>
			transform(source, {
				filename: '/src/Page.tsx',
				target: 'server',
				importedManifests: [widgetManifest]
			})
		).toThrow('JSX tag ClientWidget resolves to a type-only import');
	});

	it('diagnoses unresolved runtime JSX component tags', () => {
		const source = `
      export function Page() {
        return () => <MissingWidget />;
      }
    `;
		const manifest = analyzeSource(source, { filename: '/src/Page.tsx' });

		expect(manifest.components[0]!.diagnostics).toContain(
			'error: JSX tag MissingWidget is not defined as a runtime component'
		);
		expect(() => transform(source, { filename: '/src/Page.tsx' })).toThrow(
			'JSX tag MissingWidget is not defined'
		);
	});

	it('deduplicates repeated semantic diagnostics per component', () => {
		const manifest = analyzeSource(
			`
      export function Page() {
        return () => <section><MissingWidget /><MissingWidget /></section>;
      }
    `,
			{ filename: '/src/Page.tsx' }
		);

		expect(
			manifest.components[0]!.diagnostics.filter(
				(diagnostic) =>
					diagnostic === 'error: JSX tag MissingWidget is not defined as a runtime component'
			)
		).toHaveLength(1);
	});

	it('diagnoses JSX tags that resolve to non-component values', () => {
		const source = `
      const Widget = "not a component";

      export function Page() {
        return () => <Widget />;
      }
    `;
		const manifest = analyzeSource(source, { filename: '/src/Page.tsx' });

		expect(manifest.components[0]!.diagnostics).toContain(
			'error: JSX tag Widget resolves to variable, not a runtime component'
		);
		expect(() => transform(source, { filename: '/src/Page.tsx' })).toThrow(
			'JSX tag Widget resolves to variable'
		);
	});

	it('uses exported component identity for aliased imported client boundaries', () => {
		const manifest = analyzeSource(
			`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `,
			{ filename: '/src/ClientWidget.tsx' }
		);
		const source = `
      import { ClientWidget as Widget } from "./ClientWidget";

      export function Page() {
        return () => <Widget />;
      }
    `;
		const server = transform(source, {
			filename: '/src/Page.tsx',
			target: 'server',
			importedManifests: [manifest]
		});
		const pageManifest = analyzeSource(source, {
			filename: '/src/Page.tsx',
			importedManifests: [manifest]
		});

		expect(server).toContain('__exactBoundary');
		expect(server).toContain('"ClientWidget"');
		expect(server).not.toContain('"Widget"');
		expect(pageManifest.boundaries).toContainEqual(
			expect.objectContaining({
				name: 'ClientWidget',
				componentId: manifest.components[0]!.id,
				kind: 'client-island'
			})
		);
	});

	it('splits default imported client components using author boundary names', () => {
		const manifest = analyzeSource(
			`
      export default function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `,
			{ filename: '/src/ClientWidget.tsx' }
		);
		const source = `
      import Widget from "./ClientWidget";

      export function Page() {
        return () => <Widget />;
      }
    `;
		const server = transform(source, {
			filename: '/src/Page.tsx',
			target: 'server',
			importedManifests: [manifest]
		});
		const pageManifest = analyzeSource(source, {
			filename: '/src/Page.tsx',
			importedManifests: [manifest]
		});

		expect(manifest.exports).toContainEqual({
			name: 'default',
			kind: 'component',
			placement: 'client'
		});
		expect(manifest.symbols).toContainEqual(
			expect.objectContaining({
				exportName: 'default',
				localName: 'ClientWidget',
				generatedName: 'ClientWidget'
			})
		);
		expect(server).toContain('__exactBoundary');
		expect(server).toContain('"ClientWidget"');
		expect(server).not.toContain('"Widget"');
		expect(pageManifest.boundaries).toContainEqual(
			expect.objectContaining({
				name: 'ClientWidget',
				componentId: manifest.components[0]!.id,
				kind: 'client-island'
			})
		);
	});

	it('splits namespace imported client components using exported boundary names', () => {
		const manifest = analyzeSource(
			`
      export function ClientWidget(this: Component<{ width: number }>, props: { children?: unknown }) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++}>{props.children}</button>;
      }
    `,
			{ filename: '/src/widgets.tsx' }
		);
		const source = `
      import * as Widgets from "./widgets";

      export function Page() {
        return () => <Widgets.ClientWidget><p>Server child</p></Widgets.ClientWidget>;
      }
    `;
		const server = transform(source, {
			filename: '/src/Page.tsx',
			target: 'server',
			importedManifests: [manifest]
		});
		const pageManifest = analyzeSource(source, {
			filename: '/src/Page.tsx',
			importedManifests: [manifest]
		});

		expect(server).toContain('__exactBoundary');
		expect(server).toContain('"ClientWidget"');
		expect(server).not.toContain('"Widgets.ClientWidget"');
		expect(server).toContain('__exactVNode("p"');
		expect(pageManifest.boundaries).toContainEqual(
			expect.objectContaining({
				name: 'ClientWidget',
				componentId: manifest.components[0]!.id,
				kind: 'client-island'
			})
		);
		expect(pageManifest.boundaries).toContainEqual(
			expect.objectContaining({
				name: 'ClientWidget:children',
				componentId: manifest.components[0]!.id,
				kind: 'server-slot'
			})
		);
	});

	it('records component render subgraphs for local client boundaries', () => {
		const manifest = analyzeSource(
			`
      function ClientWidget() {
        return () => <button onClick={() => save()}>Save</button>;
      }

      export function Page() {
        return () => <section><ClientWidget /><ClientWidget /></section>;
      }
    `,
			{ filename: '/src/Page.tsx' }
		);

		const page = manifest.components.find((component) => component.name === 'Page')!;
		const widget = manifest.components.find((component) => component.name === 'ClientWidget')!;

		expect(page.placement).toBe('isomorphic');
		expect(page.subgraphPlacement).toBe('isomorphic');
		expect(page.renderEdges).toHaveLength(2);
		expect(page.renderEdges).toEqual([
			expect.objectContaining({
				id: expect.any(String),
				tag: 'ClientWidget',
				name: 'ClientWidget',
				componentId: widget.id,
				placement: 'client',
				boundary: 'client',
				index: 1,
				path: expect.any(String)
			}),
			expect.objectContaining({
				id: expect.any(String),
				tag: 'ClientWidget',
				name: 'ClientWidget',
				componentId: widget.id,
				placement: 'client',
				boundary: 'client',
				index: 2,
				path: expect.any(String)
			})
		]);
		expect(page.renderEdges[0]!.id).not.toBe(page.renderEdges[1]!.id);
	});

	it('records component render subgraphs for imported component boundaries', () => {
		const widgetManifest = analyzeSource(
			`
      export default function ClientWidget() {
        return () => <button onClick={() => save()}>Save</button>;
      }
    `,
			{ filename: '/src/ClientWidget.tsx' }
		);
		const namespaceManifest = analyzeSource(
			`
      export function ServerShell() {
        return () => <section />;
      }
    `,
			{ filename: '/src/shells.tsx' }
		);
		const manifest = analyzeSource(
			`
      import Widget from "./ClientWidget";
      import * as Shells from "./shells";

      export function Page() {
        return () => <Shells.ServerShell><Widget /></Shells.ServerShell>;
      }
    `,
			{
				filename: '/src/Page.tsx',
				importedManifests: [widgetManifest, namespaceManifest]
			}
		);

		const page = manifest.components[0]!;

		expect(page.subgraphPlacement).toBe('isomorphic');
		expect(page.renderEdges).toEqual([
			expect.objectContaining({
				tag: 'Shells.ServerShell',
				name: 'ServerShell',
				componentId: namespaceManifest.components[0]!.id,
				placement: 'isomorphic',
				boundary: 'isomorphic'
			}),
			expect.objectContaining({
				tag: 'Widget',
				name: 'ClientWidget',
				componentId: widgetManifest.components[0]!.id,
				placement: 'client',
				boundary: 'client'
			})
		]);
	});

	it('generates deterministic split component names from author names', () => {
		expect(generatedComponentName('ProjectCard', 'client-island', 1)).toBe(
			'ProjectCard_ExactClient_1'
		);
		expect(generatedComponentName('ProjectCard', 'server-part', 2)).toBe(
			'ProjectCard_ExactServer_2'
		);
		expect(generatedComponentName('123 Weird-Name', 'client-island', 3)).toBe(
			'_123_Weird_Name_ExactClient_3'
		);
	});

	it('compiles TSX and JSX files from directories', async () => {
		const root = await createTestWorkspace('exact-project-');
		await writeFile(path.join(root, 'one.tsx'), 'const one = <span />;');
		await writeFile(path.join(root, 'two.jsx'), 'const two = <strong />;');
		await writeFile(path.join(root, 'skip.ts'), 'const skip = 1;');

		const results = await compileProject([root], { outDir: path.join(root, 'out') });

		expect(results.map((result) => path.basename(result.outputFile ?? ''))).toEqual([
			'one.ts',
			'two.js'
		]);
	});
});
