/** @vitest-environment jsdom */
import { type AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { composeExactExecutorContract, handleExactRequest } from '@exactjs/server';
import { renderToHydratableString } from '@exactjs/ssr';
import { mountClientServerTest, type ClientServerTestView } from '@exactjs/testing';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished, vi } from 'vitest';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createTestWorkspace } from '../test-support/workspace.js';

const source = `import { TaskContext, type Component } from '@exactjs/core';
export function ProgressExample(this: Component<{progress: number; result: number}>) {
 this.state.progress = 0;
 this.state.result = 0;
 function report(value: number, task: TaskContext = TaskContext.client().progress()) {
  this.state.progress = value;
 }
 async function start(task: TaskContext = TaskContext.server().latest()) {
  const run = (globalThis as unknown as { exactTestingProgress: { open(signal: AbortSignal): { progress: Promise<number>; result: Promise<number> } } }).exactTestingProgress.open(task.signal);
  report(await run.progress);
  this.state.result = await run.result;
 }
 this.onMount(() => { start(); });
 return () => <main><button onClick={() => start()}>Restart</button><output>{this.state.progress}:{this.state.result}</output></main>;
}
export function Shell(this: Component<{ready: boolean}>) {
 this.state.ready = false;
 function prepare(task: TaskContext = TaskContext.server().blocking()) { this.state.ready = true; }
 prepare();
 return () => <ProgressExample/>;
}`;

/** Holds producer work until the test explicitly permits progress or terminal publication. */
function gate() {
	let resolve!: (value: number) => void;
	const promise = new Promise<number>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

it.each([false, true])(
	'public paired testing observes startup progress and owns cancellation (batch=%s)',
	async (batch) => {
		const runs: Array<{
			progress: ReturnType<typeof gate>;
			result: ReturnType<typeof gate>;
			signal: AbortSignal;
		}> = [];
		vi.stubGlobal('exactTestingProgress', {
			open(signal: AbortSignal) {
				const progress = gate();
				const result = gate();
				runs.push({ progress, result, signal });
				return { progress: progress.promise, result: result.promise };
			}
		});
		const mounted: { view?: ClientServerTestView } = {};
		onTestFinished(() => {
			mounted.view?.unmount();
			for (const run of runs) {
				run.progress.resolve(-1);
				run.result.resolve(-1);
			}
			vi.unstubAllGlobals();
		});
		const root = await createTestWorkspace('.exact-progress-testing-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		await writeFile(entry, source);
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
		const view = await mountClientServerTest({
			server,
			islands: registration.islands,
			settleTasks: false,
			hydrate: { ...registration, endpoint: '/__exact', batch },
			handle: (request) => handleExactRequest(request, { contract })
		});
		mounted.view = view;
		const test = view;
		await expect.poll(() => runs.length).toBe(1);
		const output = test.container.querySelector('output')!;
		runs[0]!.progress.resolve(10);
		await expect.poll(() => output.textContent).toBe('10:0');
		expect(test.protocol.exchanges[0]?.response?.events).toEqual(
			expect.arrayContaining([expect.objectContaining({ event: 'progress' })])
		);
		expect(test.client.pendingRequests).toBeGreaterThan(0);
		await test.getByRole('button', { name: 'Restart' }).click({ settleTasks: false });
		await expect.poll(() => runs.length).toBe(2);
		await expect.poll(() => runs[0]!.signal.aborted).toBe(true);
		runs[0]!.result.resolve(999);
		runs[1]!.progress.resolve(20);
		await expect.poll(() => output.textContent).toBe('20:0');
		runs[1]!.result.resolve(100);
		await test.settle();
		expect(output.textContent).toBe('20:100');
		expect(test.container.querySelector('output')).toBe(output);
		await test.getByRole('button', { name: 'Restart' }).click({ settleTasks: false });
		await expect.poll(() => runs.length).toBe(3);
		runs[2]!.progress.resolve(30);
		await expect.poll(() => output.textContent).toBe('30:100');
		test.unmount();
		await expect.poll(() => runs[2]!.signal.aborted).toBe(true);
		runs[2]!.result.resolve(200);
		await test.protocol.settle();
		expect(test.container.isConnected).toBe(false);
		expect(output.textContent).toBe('30:100');
	},
	30000
);
