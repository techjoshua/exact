/** @vitest-environment jsdom */
import path from 'node:path';
import type { AnyComponentFunction } from '@exactjs/core';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it, onTestFinished } from 'vitest';
import { compileFileArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createBrowserTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { artifactAnalysis } from './analysis-results.js';

it('preserves a task setup snapshot through SSR and hydration in application and library builds', async () => {
	const root = await createBrowserTestWorkspace('.exact-task-setup-snapshot-', process.cwd());
	const files = await writeTestFiles(root, {
		'package.json': '{"name":"task-setup-snapshot-fixture","type":"module"}',
		'page.tsx': `
			import { peek, TaskContext, type Component } from '@exactjs/core';
			function parse(value: string) { return value + '!'; }
			function normalize(value: string) { return '[' + value + ']'; }
			export function Page(this: Component<{ url: string; result: string; runs: number; evaluations: number }>) {
				this.state.url = 'first';
				this.state.result = '';
				this.state.runs = 0;
				const parsed = parse(this.state.url);
				let evaluations = 0;
				const request = peek(() => {
					evaluations++;
					return normalize(parsed);
				});
				this.state.evaluations = evaluations;
				function publish(task: TaskContext = TaskContext.latest()) {
					this.state.result = request;
					this.state.runs++;
				}
				publish();
				return () => <main>
					<button onClick={() => { this.state.url = 'second'; }}>Change</button>
					<output>{this.state.url}:{this.state.result}:{this.state.runs}:{this.state.evaluations}</output>
				</main>;
			}
		`
	});
	const contracts = [];
	for (const packageType of ['application', 'library'] as const) {
		const outDir = path.join(root, packageType);
		const artifact = await compileFileArtifacts(files['page.tsx']!, {
			rootDir: root,
			outDir,
			packageName: 'task-setup-snapshot-fixture',
			packageType,
			generatedValidation: 'semantic'
		});
		const { components, continuations } = artifactAnalysis(artifact);
		const [component] = components;
		const task = component?.tasks[0];
		const [continuation] = continuations;
		expect(task?.dependencies).toEqual([]);
		expect(continuation?.activation.dependencies).toEqual([
			{ index: 0, path: 'request', source: 'derived' }
		]);
		contracts.push({
			id: component?.id,
			placement: component?.placement,
			task: task?.id,
			continuations
		});

		const [server, client] = await Promise.all([
			importArtifact(artifact.serverFile, path.join(outDir, 'server.mjs')),
			importArtifact(artifact.clientFile, path.join(outDir, 'client.mjs'))
		]);
		const clientPage = client.Page as AnyComponentFunction;
		const registration = composeExactComponentContracts([clientPage], 'client');
		const rendered = await renderToHydratableString(
			receipt(server.Page as AnyComponentFunction, {}),
			{
				continuations: registration.continuations
			}
		);
		const host = document.createElement('div');
		host.innerHTML = rendered.htmlWithHydration;
		const output = host.querySelector('output')!;
		const initial = output.textContent;
		expect(['first::0:1', 'first:[first!]:1:1']).toContain(initial);
		expect(
			rendered.resumptions.some((record) => record.settledContinuations.includes(task!.id))
		).toBe(initial === 'first:[first!]:1:1');

		const reports: unknown[] = [];
		const mounted = hydrate(receipt(clientPage, {}), host, {
			...registration,
			batch: false,
			resumptions: rendered.resumptions,
			onMismatch: 'throw',
			onErrorReport: (report) => reports.push(report.error)
		});
		onTestFinished(() => mounted.dispose());
		await mounted.whenSettled();
		expect(output.textContent).toBe('first:[first!]:1:1');
		host.querySelector('button')!.click();
		await expect.poll(() => output.textContent).toBe('second:[first!]:1:1');
		await mounted.whenSettled();
		expect(output.textContent).toBe('second:[first!]:1:1');
		expect(host.querySelector('output')).toBe(output);
		expect(reports).toEqual([]);
	}
	expect(contracts[0]).toEqual(contracts[1]);
});

it.each(['application', 'library'] as const)(
	'enforces server task setup snapshot transport policy in %s',
	async (packageType) => {
		const root = await createBrowserTestWorkspace('.exact-task-private-snapshot-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `
				import { peek, TaskContext, type Component } from '@exactjs/core';
				interface State {
					/** @exact keep=client */
					draft: string;
					result: string;
				}
				export function Page(this: Component<State>) {
					this.state.draft = 'private';
					this.state.result = '';
					const snapshot = peek(() => this.state.draft);
					function publish(task: TaskContext = TaskContext.server().latest()) {
						this.state.result = snapshot;
					}
					return () => <button onClick={() => publish()}>{this.state.result}</button>;
				}
			`
		});
		await expect(
			compileFileArtifacts(files['page.tsx']!, {
				rootDir: root,
				outDir: path.join(root, 'generated'),
				packageType,
				generatedValidation: 'semantic'
			})
		).rejects.toThrow(/must not transport client-kept, server-kept, or secret data/);
	}
);
