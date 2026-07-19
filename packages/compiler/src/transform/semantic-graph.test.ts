import { describe, expect, it } from 'vitest';
import { analyzeSemanticGraph, analyzeSource } from '../index.js';

describe('@exact/compiler: semantic graph', () => {
	it('builds a semantic graph for scopes declarations imports and references', () => {
		const graph = analyzeSemanticGraph(
			`
      import fsDefault, { readFile as readProject } from "node:fs/promises";
      import type { Stats } from "node:fs";
      import * as pathTools from "node:path";
      import { Widget } from "./Widget";

      const suffix = "!";

      export function ProjectPage(this: Component<{ title: string }>, props: { label: string }) {
        const fileStats: Stats | undefined = undefined;
        const title = props.label + suffix;
        this.task(async () => {
          this.state.title = await readProject("title.txt", "utf8");
          window.addEventListener("resize", () => pathTools.join("a", "b"));
        });
        return () => <section title={title}><Widget label={title} /></section>;
      }
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		const imports = graph.declarations.filter((declaration) => declaration.kind === 'import');
		expect(imports).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'fsDefault',
					moduleSpecifier: 'node:fs/promises',
					importedName: 'default'
				}),
				expect.objectContaining({
					name: 'readProject',
					moduleSpecifier: 'node:fs/promises',
					importedName: 'readFile'
				}),
				expect.objectContaining({
					name: 'Stats',
					moduleSpecifier: 'node:fs',
					importedName: 'Stats',
					typeOnly: true
				}),
				expect.objectContaining({
					name: 'pathTools',
					moduleSpecifier: 'node:path',
					importedName: '*'
				}),
				expect.objectContaining({
					name: 'Widget',
					moduleSpecifier: './Widget',
					importedName: 'Widget'
				})
			])
		);

		const titleDeclaration = graph.declarations.find(
			(declaration) => declaration.name === 'title' && declaration.kind === 'variable'
		);
		const titleReferences = graph.references.filter((reference) => reference.name === 'title');
		expect(titleDeclaration).toBeDefined();
		expect(titleReferences).toHaveLength(2);
		expect(
			titleReferences.every((reference) => reference.declarationId === titleDeclaration!.id)
		).toBe(true);

		expect(graph.references).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'readProject',
					source: 'import',
					moduleSpecifier: 'node:fs/promises',
					importedName: 'readFile'
				}),
				expect.objectContaining({
					name: 'Stats',
					source: 'import',
					moduleSpecifier: 'node:fs',
					importedName: 'Stats',
					typeOnly: true
				}),
				expect.objectContaining({
					name: 'pathTools',
					source: 'import',
					moduleSpecifier: 'node:path',
					importedName: '*'
				}),
				expect.objectContaining({
					name: 'Widget',
					source: 'import',
					moduleSpecifier: './Widget',
					importedName: 'Widget'
				}),
				expect.objectContaining({ name: 'window', source: 'global' }),
				expect.objectContaining({ name: 'props', source: 'local' }),
				expect.objectContaining({ name: 'suffix', source: 'local' })
			])
		);
		expect(graph.references.some((reference) => reference.name === 'section')).toBe(false);
		expect(graph.references.some((reference) => reference.name === 'label')).toBe(false);
	});

	it('resolves semantic references after later declarations are collected', () => {
		const graph = analyzeSemanticGraph(
			`
      export function Panel() {
        const title = formatTitle("Ready");
        function formatTitle(value: string) {
          return value.toUpperCase();
        }
        return () => <h1>{title}</h1>;
      }
    `,
			{ filename: 'Panel.tsx' }
		);

		const declaration = graph.declarations.find(
			(item) => item.name === 'formatTitle' && item.kind === 'function'
		);
		const reference = graph.references.find((item) => item.name === 'formatTitle');
		expect(declaration).toBeDefined();
		expect(reference).toMatchObject({
			source: 'local',
			declarationId: declaration!.id
		});
	});

	it('resolves local export specifiers as semantic references', () => {
		const graph = analyzeSemanticGraph(
			`
      export function DirectPage() {
        return () => <p>Direct</p>;
      }

      function ProjectPage() {
        return () => <p>Ready</p>;
      }

      export { ProjectPage as Page };
      export { RemotePage } from "./remote";
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		expect(graph.declarations).toContainEqual(
			expect.objectContaining({
				name: 'DirectPage',
				kind: 'function',
				exportedName: 'DirectPage'
			})
		);
		const declaration = graph.declarations.find(
			(item) => item.name === 'ProjectPage' && item.kind === 'function'
		);
		const reference = graph.references.find((item) => item.name === 'ProjectPage');
		expect(declaration).toBeDefined();
		expect(reference).toMatchObject({
			source: 'local',
			declarationId: declaration!.id,
			declarationKind: 'function',
			exportedName: 'Page'
		});
		expect(graph.exports).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ exportedName: 'DirectPage', localName: 'DirectPage' }),
				expect.objectContaining({ exportedName: 'Page', localName: 'ProjectPage' }),
				expect.objectContaining({
					exportedName: 'RemotePage',
					importedName: 'RemotePage',
					moduleSpecifier: './remote'
				})
			])
		);
		expect(graph.references.some((item) => item.name === 'RemotePage')).toBe(false);
	});

	it('includes the semantic graph in analyzed manifests', () => {
		const manifest = analyzeSource(
			`
      const label = "Ready";

      export function ProjectPage() {
        return () => <p>{label}</p>;
      }
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		expect(manifest.semanticGraph).toBeDefined();
		expect(manifest.semanticGraph!.declarations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: 'label', kind: 'variable' }),
				expect.objectContaining({ name: 'ProjectPage', kind: 'function' })
			])
		);
		expect(manifest.semanticGraph!.references).toEqual(
			expect.arrayContaining([expect.objectContaining({ name: 'label', source: 'local' })])
		);
	});

	it('resolves local type declarations and type references semantically', () => {
		const graph = analyzeSemanticGraph(
			`
      interface BaseProject {
        id: string;
      }

      interface Project extends BaseProject {
        title: string;
      }

      type ProjectState = {
        project: Project;
      };

      export function ProjectPage(this: Component<ProjectState>) {
        const state: ProjectState | undefined = undefined;
        return () => <p>{this.state.project.title}</p>;
      }
    `,
			{ filename: 'ProjectPage.tsx' }
		);

		const base = graph.declarations.find(
			(item) => item.name === 'BaseProject' && item.kind === 'interface'
		);
		const project = graph.declarations.find(
			(item) => item.name === 'Project' && item.kind === 'interface'
		);
		const state = graph.declarations.find(
			(item) => item.name === 'ProjectState' && item.kind === 'type'
		);
		expect(base).toBeDefined();
		expect(project).toBeDefined();
		expect(state).toBeDefined();
		expect(graph.references).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'BaseProject',
					source: 'local',
					declarationId: base!.id,
					typeOnly: true
				}),
				expect.objectContaining({
					name: 'Project',
					source: 'local',
					declarationId: project!.id,
					typeOnly: true
				}),
				expect.objectContaining({
					name: 'ProjectState',
					source: 'local',
					declarationId: state!.id,
					typeOnly: true
				})
			])
		);
	});
});
