/** @vitest-environment jsdom */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import type { AnyComponentFunction } from '@exactjs/core';
import type { createExactClient } from '@exactjs/hydrate';
import { findElementOwner } from '@exactjs/dom/testing';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { expect, it } from 'vitest';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '../index.js';
import { artifactAnalysis } from './analysis-results.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(['member', 'indexed', 'literal', 'direct'] as const)(
	'bootstraps nested child inputs under a server Page (%s)',
	async (kind) => {
		const root = await createTestWorkspace('.exact-helper-member-input-', process.cwd());
		const input = {
			member: 'record.value',
			indexed: 'record["value"]',
			literal: '1',
			direct: 'record.value'
		}[kind];
		const files = await writeTestFiles(root, {
			'package.json': '{"name":"helper-member-input-fixture","type":"module"}',
			'tsconfig.json': JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'NodeNext',
					moduleResolution: 'NodeNext',
					jsx: 'preserve',
					jsxImportSource: '@exactjs/jsx',
					types: ['node'],
					strict: true,
					skipLibCheck: true
				}
			}),
			'page.tsx': `
				import { TaskContext, type Component } from '@exactjs/core';
				import { Workspace } from './workspace.js';
				async function pageLabel() { return typeof process.version === 'string' ? 'ready' : 'unexpected'; }
				export function Page(this: Component<{ label: string }>) {
					const loadLabel = async (_task: TaskContext = TaskContext.latest()) => {
						this.state.label = await pageLabel();
					};
					loadLabel();
					return () => <article><h1>{this.state.label}</h1><Workspace /></article>;
				}
			`,
			'workspace.tsx': `
			import type { Component } from '@exactjs/core';

			function Leaf(props: { value: number }) {
				return () => <output>{props.value}</output>;
			}
			function renderChild(record: { value: number }) {
				return <section><Leaf value={${input}} /></section>;
			}
			export function Workspace(this: Component<{ record: { value: number } }>) {
				this.state.record = { value: 1 };
				return () => <main>
					<button onClick={() => this.state.record.value++}>mutate</button>
					<button onClick={() => this.state.record = { value: this.state.record.value + 1 }}>replace</button>
					${kind === 'direct' ? '<section><Leaf value={this.state.record.value} /></section>' : '{renderChild(this.state.record)}'}
				</main>;
			}
		`
		});
		const entry = files['page.tsx']!;
		const facts = [];
		for (const packageType of ['application', 'library'] as const) {
			const outDir = path.join(root, packageType);
			const results = await compileProjectArtifacts([entry], {
				rootDir: root,
				outDir,
				serverComponents: true,
				generatedValidation: 'semantic',
				packageType,
				packageName: 'helper-member-input-fixture'
			});
			const artifact = results.find((result) => result.inputFile === files['workspace.tsx'])!;
			const component = artifactAnalysis(artifact).components.find(
				({ name }) => name === 'Workspace'
			);
			const { id, placement, renderCapability, artifactTargets } = component!;
			facts.push({ id, placement, renderCapability, artifactTargets });
			const graph = createExactArtifactGraph(results, {
				packageRoot: root,
				sourceRoot: root,
				rootDir: outDir
			});
			expect([...new Set(graph.clientIslands.map((island) => island.componentId))]).toEqual([id]);
			const pageArtifact = results.find((result) => result.inputFile === entry)!;
			expect(artifactAnalysis(pageArtifact).components[0]?.tasks[0]?.placement).toBe('server');
			const registrationFile = path.join(outDir, 'registration.ts');
			await writeFile(
				registrationFile,
				createExactHydrationRegistrationModule(graph, { clientBootstrapExportName: 'bootstrap' })
			);
			const registration = await importArtifact(
				registrationFile,
				path.join(outDir, 'registration.mjs')
			);
			const server = await importArtifact(pageArtifact.serverFile, path.join(outDir, 'server.mjs'));
			const rendered = await renderToHydratableString(
				createCompiledComponentInputReceipt(server.Page as AnyComponentFunction, {})
			);
			const container = document.createElement('div');
			container.innerHTML = rendered.htmlWithHydration;
			expect(container.querySelector('h1')?.textContent).toBe('ready');
			const buttons = [...container.querySelectorAll('button')];
			const output = container.querySelector('output')!;
			expect(output.textContent).toBe('1');
			expect(buttons).toHaveLength(2);
			expect(typeof registration.bootstrap).toBe('function');
			const reports: unknown[] = [];
			const view = (registration.bootstrap as typeof createExactClient)(container, {
				onMismatch: 'throw',
				onErrorReport: (report) => reports.push(report),
				onDiagnostic: (report) => reports.push(report)
			});
			try {
				await view.whenSettled();
				expect(container.querySelector('output')).toBe(output);
				const owner = findElementOwner(buttons[0]!);
				expect(owner?.state.record.value).toBe(1);
				for (const [index, next] of [
					[0, '2'],
					[1, '3'],
					[0, '4']
				] as const) {
					buttons[index]!.click();
					flushSync();
					await view.whenSettled();
					const current = container.querySelectorAll('button');
					expect(current).toHaveLength(buttons.length);
					buttons.forEach((button, position) => expect(current[position]).toBe(button));
					expect(container.querySelector('output')).toBe(output);
					expect(output.textContent).toBe(kind === 'literal' ? '1' : next);
					expect(owner?.state.record.value).toBe(Number(next));
				}
				expect(reports).toEqual([]);
			} finally {
				view.dispose();
			}
		}
		expect(facts[0]).toEqual(facts[1]);
	},
	30_000
);
