/** @vitest-environment jsdom */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { createExactClient, readExactHydrationConfig } from '@exactjs/hydrate';
import { findElementOwner } from '@exactjs/dom/testing';
import { flushSync } from '@exactjs/reactive';
import {
	composeExactExecutorContract,
	exactResponseToFetchResponse,
	handleExactRequest
} from '@exactjs/server';
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

it.each([
	'helper',
	'direct',
	'inert',
	'state-filter',
	'original',
	'remote',
	'remote-direct',
	'remote-wrapped',
	'remote-eager'
] as const)(
	'bootstraps the Workspace view under Page (%s)',
	async (kind) => {
		const root = await createTestWorkspace('.exact-helper-page-', process.cwd());
		await mkdir(path.join(root, 'components'));
		const remote = kind.startsWith('remote');
		const direct = kind === 'direct' || kind === 'remote-direct';
		const filter = kind === 'state-filter' || kind === 'original';
		const update = `
			const previous = this.state.items[0];
			this.state.items = [previous === 'one' ? 'two' : previous === 'two' ? 'three' : 'unexpected'];
		`;
		const helperEvent =
			kind === 'inert'
				? ''
				: kind === 'remote' || kind === 'remote-eager'
					? 'onClick={click}'
					: 'onClick={() => click(state)}';
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
				import { ${remote ? 'TaskContext, ' : ''} type Component } from '@exactjs/core';
				${direct ? '' : "import { renderWorkspace } from './workspace-view.js';"}
				export function Workspace(this: Component<{ count: number; items: string[] }>) {
					this.state.count = 0;
					this.state.items = ${kind === 'original' ? "['one', 'two']" : "['one']"};
					${remote ? 'async function run(task: TaskContext = TaskContext.server()) { this.state.count += 1; }' : ''}
					return () => ${
						kind === 'remote-direct'
							? '<button onClick={() => void run()}>{this.state.items}:{this.state.count}</button>'
							: remote
								? kind === 'remote-wrapped'
									? 'renderWorkspace(this.state, async () => { await run(); })'
									: 'renderWorkspace(this.state, () => void run())'
								: direct
									? `<button onClick={() => { ${update} }}>{this.state.items}</button>`
									: filter
										? kind === 'original'
											? 'renderWorkspace(this.state, () => this.state.count++)'
											: `renderWorkspace(this.state, () => { ${update} })`
										: `renderWorkspace(this.state, (received) => { if (received === this.state) { ${update} } })`
					};
				}
			`,
			'components/workspace-view.tsx': `
				export function renderWorkspace(state: { items: string[] ${remote ? '; count: number' : ''} }, click: ${filter ? '() => void' : kind === 'remote-wrapped' ? '(received: { items: string[] }) => Promise<void>' : '(received: { items: string[] }) => void'}) {
					${kind === 'remote-eager' ? 'click(state);' : ''}
					${kind === 'inert' ? 'const unused = () => <button onClick={() => click(state)} />; void unused;' : ''}
					${
						filter
							? `const visible = state.items.filter(value => value.length !== 0); return <div>{visible.map(value => <button onClick={click}>{value}</button>)}</div>;`
							: `return <button ${helperEvent}>{state.items}${remote ? ':{state.count}' : ''}</button>;`
					}
				}
			`
		});
		const identities = [];
		for (const packageType of ['application', 'library'] as const) {
			for (const route of ['components/page.tsx', 'App.tsx'] as const) {
				const entry = files[route]!;
				const outDir = path.join(root, packageType + '-' + path.basename(route));
				const compilation = compileProjectArtifacts([entry], {
					root,
					rootDir: root,
					outDir,
					serverComponents: true,
					packageType,
					packageName: 'helper-page-fixture',
					generatedValidation: 'semantic'
				});
				if (kind === 'remote-eager') {
					await expect(compilation).rejects.toThrow(
						'render functions may not invoke a task through a helper callback'
					);
					continue;
				}
				const artifacts = await compilation;
				const page = artifacts.find(
					(artifact) => artifact.inputFile === files['components/page.tsx']
				)!;
				expect(artifactAnalysis(page).components[0]?.tasks[0]?.placement).toBe('server');
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
				const remoteServer = remote
					? await importArtifact(workspace.serverFile, path.join(outDir, 'workspace-server.mjs'))
					: undefined;
				const contract = remoteServer
					? composeExactExecutorContract([remoteServer.Workspace as AnyComponentFunction], {
							endpoint: '/__exact'
						})
					: undefined;
				const requests: unknown[] = [];
				const output = await renderToHydratableString(
					createCompiledComponentInputReceipt(server.Page as AnyComponentFunction, {})
				);
				const container = document.createElement('div');
				container.innerHTML = output.htmlWithHydration;
				const buttons = [...container.querySelectorAll('button')];
				const button = buttons[0]!;
				expect(container.querySelector('main')?.firstChild?.textContent).toBe('ready');
				expect(buttons.map((node) => node.textContent)).toEqual(
					kind === 'original' ? ['one', 'two'] : remote ? ['one:0'] : ['one']
				);

				expect(Object.keys(registration?.islands ?? {})).toHaveLength(kind === 'inert' ? 0 : 1);
				expect(Boolean(button.closest('[data-exact-client-boundary], [data-xh]'))).toBe(
					kind !== 'inert'
				);
				const reports: unknown[] = [];
				const options: Parameters<typeof createExactClient>[1] = {
					onMismatch: 'throw',
					onErrorReport: (report) => reports.push(report),
					onDiagnostic: (report) => reports.push(report),
					...(contract && {
						endpoint: '/__exact',
						batch: false,
						fetch: async (url, init) => {
							const body = JSON.parse(init.body) as unknown;
							requests.push(body);
							const response = await handleExactRequest(
								{ method: init.method, url, headers: init.headers, body, signal: init.signal },
								{ contract, invocations: {}, logger: { log: (report) => reports.push(report) } }
							);
							return exactResponseToFetchResponse(response);
						}
					})
				};
				const view =
					kind === 'inert'
						? createExactClient(container, { ...readExactHydrationConfig(container), ...options })
						: bootstrap!(container, options);
				try {
					await view.whenSettled();
					expect(container.querySelector('button')).toBe(button);
					if (remote) {
						const owner = findElementOwner(button);
						expect(owner?.state.count).toBe(0);
						expect(requests).toHaveLength(0);
						button.click();
						await expect.poll(() => button.textContent).toBe('one:1');
						expect(owner?.state.count).toBe(1);
						expect(requests).toHaveLength(1);
						expect(container.querySelector('button')).toBe(button);
					} else if (kind === 'original') {
						const owner = findElementOwner(button);
						expect(owner?.state.count).toBe(0);
						for (const [index, original] of buttons.entries()) {
							original.click();
							flushSync();
							await view.whenSettled();
							const current = container.querySelectorAll('button');
							expect(current).toHaveLength(buttons.length);
							buttons.forEach((node, position) => expect(current[position]).toBe(node));
							expect(owner?.state.count).toBe(index + 1);
						}
					} else {
						for (const next of kind === 'inert' ? ['one', 'one'] : ['two', 'three']) {
							container.querySelector('button')!.click();
							flushSync();
							await view.whenSettled();
							const current = container.querySelector('button');
							if (kind !== 'state-filter') expect(current).toBe(button);
							expect(current?.textContent).toBe(next);
						}
					}
					expect(reports).toEqual([]);
				} finally {
					view.dispose();
				}
			}
		}
		if (kind !== 'remote-eager') expect(new Set(identities).size).toBe(1);
	},
	30_000
);
