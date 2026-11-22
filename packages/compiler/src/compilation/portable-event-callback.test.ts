/** @vitest-environment jsdom */
import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { findElementOwner } from '@exactjs/dom/testing';
import { createExactClient } from '@exactjs/hydrate';
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
import { writeExactPublishedComponentBuildFacts } from '../component-library-build.js';
import type { CompileArtifactsResult } from '../types.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { artifactAnalysis } from './analysis-results.js';

const buttonPackage = '@fixture/portable-button';

it.each(['direct', 'alias', 'helper', 'installed'] as const)(
	'uses one portable Button for server and local callbacks (%s)',
	async (binding) => {
		const installed = binding === 'installed';
		const root = await createTestWorkspace('.exact-portable-button-', process.cwd());
		const config = {
			compilerOptions: {
				target: 'ES2022',
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				jsx: 'preserve',
				jsxImportSource: '@exactjs/jsx',
				types: ['node'],
				strict: true,
				skipLibCheck: true
			},
			files: ['Button.tsx']
		};
		const files = await writeTestFiles(root, {
			'tsconfig.json': JSON.stringify(config),
			'package.json': JSON.stringify({
				name: 'portable-button-fixture',
				type: 'module',
				...(installed && { dependencies: { [buttonPackage]: '1.0.0' } })
			}),
			'Button.tsx': `
				import type { Component } from '@exactjs/core';
				type Props = { label: string; onClick: () => void };
				function renderButton(label: string, click: () => void) {
					return <button onClick={click}>{label}</button>;
				}
				export function Button(this: Component<Record<string, never>>, props: Props) {
					${binding === 'alias' ? 'const { onClick } = props;' : ''}
					return () => ${
						binding === 'helper'
							? 'renderButton(props.label, props.onClick)'
							: `<button onClick={${binding === 'alias' ? 'onClick' : 'props.onClick'}}>{props.label}</button>`
					};
				}
			`,
			'Page.tsx': `
				import { TaskContext, type Component } from '@exactjs/core';
				import { Button } from '${installed ? buttonPackage : './Button.js'}';
				export function Page(this: Component<{ remote: number; local: number }>) {
					this.state.remote = 0;
					this.state.local = 0;
					async function save(task: TaskContext = TaskContext.server()) {
						this.state.remote += 1;
					}
					const updateRemote = () => void save();
					const updateLocal = () => { this.state.local += 1; };
					return () => <section>
						<Button label="remote" onClick={updateRemote} />
						<Button label="local" onClick={updateLocal} />
						<output>{this.state.remote}:{this.state.local}</output>
					</section>;
				}
				/** @exact server */
				export function Shell() {
					return () => <main><Page /></main>;
				}
			`
		});
		const options = {
			root,
			rootDir: root,
			serverComponents: true,
			packageName: buttonPackage,
			generatedValidation: 'semantic' as const
		};
		const buttonFile = files['Button.tsx']!;
		const pageFile = files['Page.tsx']!;
		const [standalone] = await compileProjectArtifacts([buttonFile], {
			...options,
			packageType: 'library',
			outDir: path.join(root, 'library')
		});
		expect(standalone).toBeDefined();
		const library = installed ? await installPairedButton(root, standalone!) : undefined;
		if (installed) {
			await unlink(buttonFile);
			await writeFile(files['tsconfig.json']!, JSON.stringify({ ...config, files: ['Page.tsx'] }));
		}
		const outDir = path.join(root, 'app');
		const artifacts = await compileProjectArtifacts([pageFile], {
			...options,
			packageType: 'application',
			packageName: installed ? 'portable-button-fixture' : buttonPackage,
			outDir
		});
		if (installed) {
			expect(artifacts.map((artifact) => artifact.inputFile)).toEqual([pageFile]);
		} else {
			const appButton = artifacts.find((artifact) => artifact.inputFile === buttonFile)!;
			expect(artifactAnalysis(appButton).components).toEqual(
				artifactAnalysis(standalone!).components
			);
			for (const target of ['clientFile', 'serverFile'] as const) {
				expect(await readFile(appButton[target], 'utf8')).toBe(
					await readFile(standalone![target], 'utf8')
				);
				await copyFile(standalone![target], appButton[target]);
			}
		}
		const graph = createExactArtifactGraph(artifacts, {
			packageRoot: root,
			sourceRoot: root,
			rootDir: outDir
		});
		if (installed) {
			expect(graph.clientIslands.map((entry) => entry.componentId)).toContain(
				standalone!.build.componentIds[0]
			);
		}
		const registrationFile = path.join(outDir, 'registration.ts');
		await writeFile(
			registrationFile,
			createExactHydrationRegistrationModule(graph, { clientBootstrapExportName: 'bootstrap' })
		);
		const { bootstrap } = await importArtifact(
			registrationFile,
			path.join(outDir, 'registration.mjs'),
			library && { [buttonPackage]: library.client }
		);
		const page = artifacts.find((artifact) => artifact.inputFile === pageFile)!;
		const server = await importArtifact(
			page.serverFile,
			path.join(outDir, 'server.mjs'),
			library && { [buttonPackage]: library.server }
		);
		const Page = server.Page as AnyComponentFunction;
		const contract = composeExactExecutorContract([Page], { endpoint: '/__exact' });
		const ssr = await renderToHydratableString(
			createCompiledComponentInputReceipt(server.Shell as AnyComponentFunction, {})
		);
		const container = document.createElement('div');
		container.innerHTML = ssr.htmlWithHydration;
		const [remote, local] = container.querySelectorAll('button');
		const output = container.querySelector('output')!;
		expect([remote?.textContent, local?.textContent]).toEqual(['remote', 'local']);
		expect(output.textContent).toBe('0:0');

		const reports: unknown[] = [];
		const requests: unknown[] = [];
		const view = (bootstrap as typeof createExactClient)(container, {
			onMismatch: 'throw',
			onDiagnostic: (report) => reports.push(report),
			onErrorReport: (report) => reports.push(report),
			endpoint: '/__exact',
			batch: false,
			fetch: async (url, init) => {
				const body = JSON.parse(init.body) as unknown;
				requests.push(body);
				return exactResponseToFetchResponse(
					await handleExactRequest(
						{ method: init.method, url, headers: init.headers, body, signal: init.signal },
						{ contract, invocations: {}, logger: { log: (report) => reports.push(report) } }
					)
				);
			}
		});
		try {
			await view.whenSettled();
			expect(container.querySelectorAll('button')[0]).toBe(remote);
			expect(container.querySelectorAll('button')[1]).toBe(local);
			const remoteOwner = findElementOwner(remote!);
			const localOwner = findElementOwner(local!);
			expect(remoteOwner?.type.name).toBe('Button');
			expect(remoteOwner?.type).toBe(localOwner?.type);
			expect(remoteOwner).not.toBe(localOwner);
			expect(requests).toHaveLength(0);
			remote!.click();
			await expect.poll(() => output.textContent).toBe('1:0');
			expect(requests).toHaveLength(1);
			local!.click();
			flushSync();
			await view.whenSettled();
			expect(output.textContent).toBe('1:1');
			expect(requests).toHaveLength(1);
			expect(reports).toEqual([]);
		} finally {
			view.dispose();
		}
	},
	30_000
);

/** Installs only declarations and generated artifacts. The consumer has no library source to inspect. */
async function installPairedButton(root: string, component: CompileArtifactsResult) {
	const library = path.join(root, 'node_modules', buttonPackage);
	const clientModule = 'dist/client/Button.js';
	const serverModule = 'dist/server/Button.js';
	const client = path.join(library, clientModule);
	const server = path.join(library, serverModule);
	await mkdir(path.dirname(client), { recursive: true });
	await mkdir(path.dirname(server), { recursive: true });
	await writeTestFiles(library, {
		'package.json': JSON.stringify({
			name: buttonPackage,
			version: '1.0.0',
			type: 'module',
			exports: {
				'.': {
					types: './dist/Button.d.ts',
					browser: './' + clientModule,
					default: './' + serverModule
				}
			},
			exactCompiledComponents: ['Button'],
			exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' }
		}),
		'dist/Button.d.ts': `import type { Child, Component } from '@exactjs/core';
			export declare function Button(this: Component<Record<string, never>>,
				props: { label: string; onClick: () => void }): () => Child;`,
		[clientModule]: stripTypeScriptTypes(await readFile(component.clientFile, 'utf8')),
		[serverModule]: stripTypeScriptTypes(await readFile(component.serverFile, 'utf8'))
	});
	const {
		componentBuild,
		componentIds,
		clientRegistrations,
		serverRegistrations,
		operations,
		boundaries,
		exposureRoots
	} = component.build;
	await writeExactPublishedComponentBuildFacts(library, 'dist/exact-component-build.json', {
		package: { name: buttonPackage, version: '1.0.0' },
		modules: [clientModule, serverModule].map((module) => ({
			path: module,
			facts: componentBuild,
			artifacts: {
				clientModule,
				serverModule,
				build: { clientRegistrations, serverRegistrations, operations, boundaries, exposureRoots }
			}
		})),
		exports: (['browser', 'default'] as const).map((condition) => {
			const module = condition === 'browser' ? clientModule : serverModule;
			return {
				subpath: '.',
				condition,
				module,
				componentModule: module,
				exportName: 'Button',
				componentId: componentIds[0]!
			};
		})
	});
	return { client, server };
}
