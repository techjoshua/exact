import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProject, generatedComponentName, transform } from '../index.js';
import { analyzeSource } from './source-analysis.js';
import { createTestWorkspace } from '../test-support/workspace.js';

describe('@exactjs/compiler: diagnostics', () => {
	it('diagnoses unresolved runtime JSX component tags', () => {
		const source = `
      export function Page() {
        return () => <MissingWidget />;
      }
    `;
		const analysis = analyzeSource(source, { filename: '/src/Page.tsx' });

		expect(analysis.components[0]!.diagnostics).toContain(
			'error: JSX tag MissingWidget is not defined as a runtime component'
		);
		expect(() => transform(source, { filename: '/src/Page.tsx' })).toThrow(
			'JSX tag MissingWidget is not defined'
		);
	});

	it('deduplicates repeated semantic diagnostics per component', () => {
		const analysis = analyzeSource(
			`
      export function Page() {
        return () => <section><MissingWidget /><MissingWidget /></section>;
      }
    `,
			{ filename: '/src/Page.tsx' }
		);

		expect(
			analysis.components[0]!.diagnostics.filter(
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
		const analysis = analyzeSource(source, { filename: '/src/Page.tsx' });

		expect(analysis.components[0]!.diagnostics).toContain(
			'error: JSX component-position value is not callable or constructable and cannot be a dynamic component'
		);
		expect(() => transform(source, { filename: '/src/Page.tsx' })).toThrow(
			'JSX component-position value is not callable or constructable'
		);
	});

	it('records SSR-capable render subgraphs for local interactive components', () => {
		const analysis = analyzeSource(
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

		const page = analysis.components.find((component) => component.name === 'Page')!;
		const widget = analysis.components.find((component) => component.name === 'ClientWidget')!;

		expect(page.placement).toBe('isomorphic');
		expect(page.subgraphPlacement).toBe('isomorphic');
		expect(page.renderEdges).toHaveLength(2);
		expect(page.renderEdges).toEqual([
			expect.objectContaining({
				id: expect.any(String),
				tag: 'ClientWidget',
				name: 'ClientWidget',
				componentId: widget.id,
				placement: 'isomorphic',
				boundary: 'isomorphic',
				index: 1,
				path: expect.any(String)
			}),
			expect.objectContaining({
				id: expect.any(String),
				tag: 'ClientWidget',
				name: 'ClientWidget',
				componentId: widget.id,
				placement: 'isomorphic',
				boundary: 'isomorphic',
				index: 2,
				path: expect.any(String)
			})
		]);
		expect(page.renderEdges[0]!.id).not.toBe(page.renderEdges[1]!.id);
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

	it('compiles TypeScript and JavaScript source modules from directories', async () => {
		const root = await createTestWorkspace('exact-project-');
		await writeFile(path.join(root, 'one.tsx'), 'const one = <span />;');
		await writeFile(path.join(root, 'two.jsx'), 'const two = <strong />;');
		await writeFile(path.join(root, 'skip.ts'), 'const skip = 1;');

		const results = await compileProject([root], { outDir: path.join(root, 'out') });

		expect(results.map((result) => path.basename(result.outputFile ?? ''))).toEqual([
			'one.ts',
			'skip.ts',
			'two.js'
		]);
	});
});
