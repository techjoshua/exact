/** @vitest-environment jsdom */
import { type AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { hydrate } from '@exactjs/hydrate';
import {
	composeExactExecutorContract,
	exactResponseToFetchResponse,
	handleExactRequest
} from '@exactjs/server';
import { renderToHydratableString } from '@exactjs/ssr';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
	compileFileArtifacts,
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '../index.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mountClientServerTest } from '@exactjs/testing';
import { importArtifact } from '../test-support/import-artifact.js';
import { createTestWorkspace } from '../test-support/workspace.js';

const source = `import { TaskContext, type Component } from '@exactjs/core';
export function ProgressExample(this: Component<{ progress: number; result: number }>) {
 this.state.progress = 0;
 this.state.result = 0;
 async function reportProgress(snapshot: number, task: TaskContext = TaskContext.client().progress()) {
  await Promise.resolve();
  this.state.progress = snapshot;
 }
 async function start(task: TaskContext = TaskContext.server()) {
  await new Promise<void>(resolve => { setTimeout(resolve, 20); });
  reportProgress(42);
  await new Promise<void>(resolve => { setTimeout(resolve, 300); });
  this.state.result += 100;
 }
 return () => <main><button onClick={() => start()}>Start</button><output>{this.state.progress}:{this.state.result}</output></main>;
}`;

describe('compiled task progress loopback', () => {
	it.each([
		{ batch: false, supported: true, deferred: false },
		{ batch: true, supported: true, deferred: true },
		{ batch: false, supported: false, deferred: false },
		{ batch: true, supported: false, deferred: true },
		{ batch: true, supported: true, deferred: false, packaged: true },
		{ batch: false, supported: false, deferred: true, packaged: true }
	])(
		'delivers progress or falls back without replay ($batch, $supported, $deferred, packaged=$packaged)',
		async ({ batch, supported, deferred, packaged }) => {
			const root = await createTestWorkspace('.exact-progress-loopback-', process.cwd());
			const entry = path.join(root, packaged ? 'src/index.tsx' : 'page.tsx');
			if (packaged) {
				await mkdir(path.join(root, 'src'));
				await writeFile(
					path.join(root, 'package.json'),
					JSON.stringify({
						name: '@fixture/progress-library',
						version: '1.0.0',
						type: 'module',
						files: ['dist'],
						exports: {
							'.': {
								types: './dist/index.d.ts',
								browser: './dist/client/index.js',
								default: './dist/server/index.js'
							}
						},
						exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' },
						exactCompiledComponents: ['ProgressExample'],
						dependencies: {
							'@exactjs/core': '^0.6.3',
							'@exactjs/dom': '^0.6.0',
							'@exactjs/ssr': '^0.6.0',
							'@exactjs/component-library': '^0.6.0'
						}
					})
				);
				await writeFile(
					path.join(root, 'tsconfig.json'),
					JSON.stringify({
						compilerOptions: {
							target: 'ES2022',
							module: 'NodeNext',
							moduleResolution: 'NodeNext',
							strict: true,
							jsx: 'react-jsx',
							jsxImportSource: '@exactjs/jsx',
							skipLibCheck: true,
							rootDir: 'src',
							outDir: 'dist',
							declaration: true
						},
						include: ['src']
					})
				);
			}
			await writeFile(
				entry,
				(deferred
					? source.replace('TaskContext.server()', 'TaskContext.server().deferred()')
					: source
				)
					.replace(
						'async function reportProgress(snapshot: number, task: TaskContext = TaskContext.client().progress()) {',
						'const reportProgress = async (snapshot: number, task: TaskContext = TaskContext.client().progress()) => {'
					)
					.replace(
						'async function start(task: TaskContext = TaskContext.server()',
						'const start = async (task: TaskContext = TaskContext.server()'
					)
					.replace('TaskContext.server()) {', 'TaskContext.server()) => {')
					.replace('TaskContext.server().deferred()) {', 'TaskContext.server().deferred()) => {')
			);
			const logger = { log: vi.fn() };
			let requests = 0;

			if (packaged) {
				const buildScript = path.join(root, 'build.mjs');
				await writeFile(
					buildScript,
					"import {buildLibrary} from '@exactjs/compiler/library-build'; await buildLibrary({root:process.argv[2]});"
				);
				await promisify(execFile)(process.execPath, [buildScript, root], {
					cwd: process.cwd(),
					timeout: 20000
				});
			}
			const artifacts = packaged
				? {
						clientFile: path.join(root, 'dist/client/index.js'),
						serverFile: path.join(root, 'dist/server/index.js')
					}
				: await compileFileArtifacts(entry, { rootDir: root, outDir: root });

			const clientModule = await importArtifact(
				artifacts.clientFile,
				path.join(root, 'client.mjs')
			);
			const serverModule = await importArtifact(
				artifacts.serverFile,
				path.join(root, 'server.mjs')
			);
			const Client = clientModule.ProgressExample as AnyComponentFunction;
			const Server = serverModule.ProgressExample as AnyComponentFunction;
			const registration = composeExactComponentContracts([Client], 'client');
			const contract = composeExactExecutorContract([Server], { endpoint: '/__exact' });
			const rendered = await renderToHydratableString(createCompiledComponentReceipt(Server, {}));
			const container = document.createElement('main');
			container.innerHTML = rendered.html;
			const client = hydrate(createCompiledComponentReceipt(Client, {}), container, {
				...registration,
				resumptions: rendered.resumptions,
				endpoint: '/__exact',
				batch,
				fetch: async (url, init) => {
					requests++;
					return exactResponseToFetchResponse(
						await handleExactRequest(
							{
								url,
								method: init.method,
								headers: init.headers,
								body: JSON.parse(init.body),
								signal: init.signal
							},
							{ contract, logger, progress: { supported, reason: 'test host buffers responses' } }
						)
					);
				}
			});
			onTestFinished(() => client.dispose());
			container.querySelector('button')!.click();
			if (supported)
				await expect.poll(() => container.querySelector('output')!.textContent).toBe('42:0');
			await expect
				.poll(() => container.querySelector('output')!.textContent)
				.toBe(`${supported ? 42 : 0}:100`);
			container.querySelector('button')!.click();
			await expect
				.poll(() => container.querySelector('output')!.textContent)
				.toBe(`${supported ? 42 : 0}:200`);
			expect(requests).toBe(2);
			const warnings = logger.log.mock.calls
				.map(([event]) => event)
				.filter((event) => event.level === 'warn');
			expect(warnings).toHaveLength(supported ? 0 : 1);
			if (!supported) {
				expect(warnings[0].message).toContain('ProgressExample.reportProgress');
				if (packaged) expect(warnings[0].message).toContain('@fixture/progress-library');
			}
		},
		30000
	);
});

it.each([false, true])(
	'delivers progress through generated islands registration (batch=%s)',
	async (batch) => {
		const root = await createTestWorkspace('.exact-progress-islands-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		await writeFile(
			entry,
			source +
				`
export function Shell(this: Component<{ready: boolean}>) {
 this.state.ready=false;
 function prepare(task: TaskContext=TaskContext.server().blocking()) {this.state.ready=true}
 prepare();
 return () => <main><ProgressExample/></main>;
}`
		);
		const outDir = path.join(root, 'generated');
		const artifacts = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir,
			serverComponents: true
		});
		const page = artifacts.find((artifact) => artifact.inputFile === entry)!;
		const graph = createExactArtifactGraph(artifacts, {
			packageRoot: root,
			sourceRoot: root,
			rootDir: outDir
		});
		const registry = path.join(outDir, 'registration.ts');
		await writeFile(registry, createExactHydrationRegistrationModule(graph));
		const serverModule = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
		const registryModule = await importArtifact(registry, path.join(root, 'registration.mjs'));
		const registration = registryModule.exactHydrationRegistration as {
			islands: Parameters<typeof mountClientServerTest>[0]['islands'];
		};
		const Server = serverModule.Shell as AnyComponentFunction;
		const contract = composeExactExecutorContract(
			[Server, serverModule.ProgressExample as AnyComponentFunction],
			{ endpoint: '/__exact' }
		);
		const server = await renderToHydratableString(createCompiledComponentReceipt(Server, {}));
		const test = await mountClientServerTest({
			server,
			islands: registration.islands,
			hydrate: { ...registration, endpoint: '/__exact', batch },
			handle: (request) => handleExactRequest(request, { contract })
		});
		onTestFinished(() => test.unmount());
		const output = test.container.querySelector('output')!;
		const button = test.container.querySelector('button')!;
		button.click();
		await expect.poll(() => output.textContent).toBe('42:0');
		await expect.poll(() => output.textContent).toBe('42:100');
		button.click();
		await expect.poll(() => output.textContent).toBe('42:200');
		expect(test.container.querySelector('output')).toBe(output);
		expect(test.container.querySelector('button')).toBe(button);
	}
);
