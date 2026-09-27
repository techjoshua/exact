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
export function ProgressExample(this: Component<{progress: number; result: number; independent: number}>) {
 this.state.progress = 0;
 this.state.result = 0;
 this.state.independent = 0;
 function independent(task: TaskContext = TaskContext.server()) { this.state.independent++; }
 function report(value: number, task: TaskContext = TaskContext.client().progress()) {
  this.state.progress = value;
 }
 async function start(task: TaskContext = TaskContext.server().latest()) {
  const run = (globalThis as unknown as { exactTestingProgress: { open(signal: AbortSignal): { progress: Promise<number>; result: Promise<number> } } }).exactTestingProgress.open(task.signal);
  report(await run.progress);
  this.state.result = await run.result;
 }
 this.onMount(() => { start(); });
 return () => <main><button onClick={() => start()}>Restart</button><button onClick={() => independent()}>Independent</button><aside>{this.state.independent}</aside><output>{this.state.progress}:{this.state.result}</output></main>;
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

// PRs exercise each axis in both states. Scheduled acceptance runs the full bounded product.
const combinations = [false, true].flatMap((batch) =>
	[false, true].flatMap((startup) =>
		[false, true].map((asyncReceiver) => ({ batch, startup, asyncReceiver, overlap: false }))
	)
);
const cases =
	process.env.EXACT_EXTENDED_TESTING === '1'
		? combinations
		: combinations.filter(
				({ batch, startup, asyncReceiver }) => asyncReceiver === (batch !== startup)
			);
it.each([...cases, { batch: true, startup: false, asyncReceiver: false, overlap: true }])(
	'public paired lifecycle batch=$batch startup=$startup asyncReceiver=$asyncReceiver overlap=$overlap',
	async ({ batch, startup, asyncReceiver, overlap }) => {
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
		await writeFile(
			entry,
			source
				.replace(
					'this.state.independent++;',
					overlap
						? 'this.state.independent++; this.state.result = 500;'
						: 'this.state.independent++;'
				)
				.replace(
					' this.onMount(() => { start(); });',
					startup ? ' this.onMount(() => { start(); });' : ''
				)
				.replace(
					' function report(',
					asyncReceiver ? ' async function report(' : ' function report('
				)
				.replace(
					'  this.state.progress = value;',
					asyncReceiver
						? '  await Promise.resolve(); this.state.progress = value;'
						: '  this.state.progress = value;'
				)
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
		const errors: unknown[] = [];
		const view = await mountClientServerTest({
			server,
			islands: registration.islands,
			settleTasks: false,
			hydrate: {
				...registration,
				endpoint: '/__exact',
				batch,
				onErrorReport: (report) => errors.push(report.error),
				onDiagnostic: (diagnostic) => errors.push(diagnostic)
			},
			handle: (request) =>
				handleExactRequest(request, {
					contract,
					logger: {
						log(event) {
							if (event.level === 'error') errors.push(event);
						}
					}
				})
		});
		mounted.view = view;
		const test = view;
		if (!startup) {
			await expect.poll(() => test.container.querySelector('button')).not.toBeNull();
			await test.getByRole('button', { name: 'Restart' }).click({ settleTasks: false });
		}
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
		await test.getByRole('button', { name: 'Independent' }).click({ settleTasks: false });
		await expect.poll(() => test.container.querySelector('aside')?.textContent).toBe('1');
		runs[0]!.result.resolve(999);
		runs[1]!.progress.resolve(20);
		await expect.poll(() => output.textContent).toBe(overlap ? '20:500' : '20:0');
		runs[1]!.result.resolve(100);
		await test.settle();
		expect(output.textContent).toBe(overlap ? '20:500' : '20:100');
		expect(test.container.querySelector('output')).toBe(output);
		await test.getByRole('button', { name: 'Restart' }).click({ settleTasks: false });
		await expect.poll(() => runs.length).toBe(3);
		runs[2]!.progress.resolve(30);
		await expect.poll(() => output.textContent).toBe(overlap ? '30:500' : '30:100');
		test.unmount();
		await expect.poll(() => runs[2]!.signal.aborted).toBe(true);
		runs[2]!.result.resolve(200);
		await test.protocol.settle();
		expect(test.container.isConnected).toBe(false);
		expect(output.textContent).toBe(overlap ? '30:500' : '30:100');
		expect(errors).toEqual([]);
	},
	30000
);
