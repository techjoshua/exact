/** @vitest-environment jsdom */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { createExactClient, readExactHydrationConfig } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it } from 'vitest';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { artifactAnalysis } from './analysis-results.js';

it.each(['helper', 'direct', 'inert'] as const)(
	'bootstraps the Workspace view under Page (%s)',
	async (kind) => {
		const root = await createTestWorkspace('.exact-helper-page-', process.cwd());
		await mkdir(path.join(root, 'components'));
		const update = `
			const previous = this.state.items[0];
			this.state.items = [previous === 'one' ? 'two' : previous === 'two' ? 'three' : 'unexpected'];
		`;
		const files = await writeTestFiles(root, {
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
			'package.json': '{"name":"helper-page-fixture","type":"module"}',
			'App.tsx': `export { Page } from './components/page.js';`,
			'provider.ts': `export async function quote() { return process.env.QUOTE ?? 'ready'; }`,
			'components/page.tsx': `
				import { TaskContext, type Component } from '@exactjs/core';
				import { quote } from '../provider.js';
				import { Workspace } from './workspace.js';
				export function Page(this: Component<{ value: string }>) {
					const runFixtureTask = async (_task: TaskContext = TaskContext.latest()) => {
						this.state.value = await quote();
					};
					runFixtureTask();
					return () => <main>{this.state.value}<Workspace /></main>;
				}
			`,
			'components/workspace.tsx': `
				import type { Component } from '@exactjs/core';
				${kind === 'direct' ? '' : "import { renderWorkspace } from './workspace-view.js';"}
				export function Workspace(this: Component<{ items: string[] }>) {
					this.state.items = ['one'];
					return () => ${
						kind === 'direct'
							? `<button onClick={() => { ${update} }}>{this.state.items}</button>`
							: `renderWorkspace(this.state, (received) => { if (received === this.state) { ${update} } })`
					};
				}
			`,
			'components/workspace-view.tsx': `
				export function renderWorkspace(state: { items: string[] }, click: (received: { items: string[] }) => void) {
					${kind === 'inert' ? 'const unused = () => <button onClick={() => click(state)} />; void unused;' : ''}
					return <button ${kind === 'inert' ? '' : 'onClick={() => click(state)}'}>{state.items}</button>;
				}
			`
		});
		const identities = [];
		for (const packageType of ['application', 'library'] as const) {
			for (const route of ['components/page.tsx', 'App.tsx'] as const) {
				const entry = files[route]!;
				const outDir = path.join(root, packageType + '-' + path.basename(route));
				const artifacts = await compileProjectArtifacts([entry], {
					root,
					rootDir: root,
					outDir,
					serverComponents: true,
					packageType,
					packageName: 'helper-page-fixture',
					generatedValidation: 'semantic'
				});
				const workspace = artifacts.find(
					(artifact) => artifact.inputFile === files['components/workspace.tsx']
				)!;
				const [component] = artifactAnalysis(workspace).components;
				expect(component?.placement).toBe('isomorphic');
				identities.push(component?.id);
				expect(component?.artifactTargets).toEqual(['client', 'server']);
				const graph = createExactArtifactGraph(artifacts, {
					packageRoot: root,
					sourceRoot: root,
					rootDir: outDir
				});
				expect(graph.clientIslands.map((island) => island.componentId)).toEqual(
					kind === 'inert' ? [] : [component?.id]
				);
				const registrationFile = path.join(outDir, 'registration.ts');
				await writeFile(
					registrationFile,
					createExactHydrationRegistrationModule(graph, { clientBootstrapExportName: 'bootstrap' })
				);
				const registrationModule = await importArtifact(
					registrationFile,
					path.join(outDir, 'registration.mjs')
				);
				const registration = registrationModule.exactHydrationRegistration as Parameters<
					typeof createExactClient
				>[1];
				const bootstrap = registrationModule.bootstrap as typeof createExactClient | undefined;
				const server = await importArtifact(
					artifacts.find((artifact) => artifact.inputFile === entry)!.serverFile,
					path.join(outDir, 'server.mjs')
				);
				const output = await renderToHydratableString(
					createCompiledComponentInputReceipt(server.Page as AnyComponentFunction, {})
				);
				const container = document.createElement('div');
				container.innerHTML = output.htmlWithHydration;
				const button = container.querySelector('button')!;
				expect(button.textContent).toBe('one');
				expect(Object.keys(registration?.islands ?? {})).toHaveLength(kind === 'inert' ? 0 : 1);
				expect(Boolean(button.closest('[data-exact-client-boundary], [data-xh]'))).toBe(
					kind !== 'inert'
				);
				const reports: unknown[] = [];
				const options: Parameters<typeof createExactClient>[1] = {
					onMismatch: 'throw',
					onErrorReport: (report) => reports.push(report),
					onDiagnostic: (report) => reports.push(report)
				};
				const view =
					kind === 'inert'
						? createExactClient(container, { ...readExactHydrationConfig(container), ...options })
						: bootstrap!(container, options);
				try {
					await view.whenSettled();
					expect(container.querySelector('button')).toBe(button);
					for (const next of kind === 'inert' ? ['one', 'one'] : ['two', 'three']) {
						button.click();
						flushSync();
						await view.whenSettled();
						expect(container.querySelector('button')).toBe(button);
						expect(button.textContent).toBe(next);
					}
					expect(reports).toEqual([]);
				} finally {
					view.dispose();
				}
			}
		}
		expect(new Set(identities).size).toBe(1);
	},
	30_000
);
