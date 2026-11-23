/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { withComponentDomain, type AnyComponentFunction } from '@exactjs/core';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { composeExactExecutorContract, handleExactRequest } from '@exactjs/server';
import { mountClientServerTest } from '@exactjs/testing';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each([
	{ mode: 'argument with a string', prepared: false, authored: false, batch: false },
	{ mode: 'argument with an authored method', prepared: false, authored: true, batch: false },
	{ mode: 'prepared state with a string', prepared: true, authored: false, batch: false },
	{ mode: 'prepared state with an authored method', prepared: true, authored: true, batch: false },
	{ mode: 'batch with a string argument', prepared: false, authored: false, batch: true },
	{ mode: 'batch with an authored argument method', prepared: false, authored: true, batch: true },
	{ mode: 'batch with prepared string state', prepared: true, authored: false, batch: true },
	{
		mode: 'batch with an authored method in prepared state',
		prepared: true,
		authored: true,
		batch: true
	}
])('validates mounted server task $mode', async ({ prepared, authored, batch }) => {
	const root = await createCompilerTestWorkspace(
		'.exact-task-invocation-transport-',
		process.cwd()
	);
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`import {TaskContext, type Component} from '@exactjs/core';
interface Trimmable { trim(): string }
export function Reader(this: Component<{result:string; rows:number[]; item:Trimmable}>) {
	this.state.result = '';
	this.state.rows = [1];
	this.state.item = ' initial ';
	const run = (current: Trimmable, task: TaskContext = TaskContext.server().blocking()) =>
		current.trim();
	const runPrepared = (task: TaskContext = TaskContext.server().blocking()) => {
		this.state.rows.push(2);
		const item = this.state.item;
		return typeof item === 'string' ? item.trim() : 'unexpected item';
	};
	return () => <div>
		<button onClick={async () => {
			const input: Trimmable = ${authored ? "{trim(){return 'authored';}}" : "' first '"};
			${prepared ? 'this.state.item = input;' : ''}
			const pending = [${batch ? "run(' good '), " : ''}${prepared ? 'runPrepared()' : 'run(input)'}];
			const settled = await Promise.allSettled(pending);
			this.state.result = settled.map((result) =>
				result.status === 'fulfilled' ? result.value : result.reason.message
			).join('|');
		}}>Run</button>
		<output>{this.state.result}</output><span data-rows>{this.state.rows.length}</span>
	</div>;
}
export function Page(this: Component<{}>) { return () => <Reader/>; }`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated'),
		generatedValidation: 'semantic'
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const Client = client.Page as AnyComponentFunction;
	const contract = composeExactExecutorContract([
		server.Page as AnyComponentFunction,
		server.Reader as AnyComponentFunction
	]);
	const host = document.createElement('div');
	const reports: unknown[] = [];
	let requests = 0;
	const view = await mountClientServerTest({
		container: host,
		server: { html: '' },
		islands: {},
		hydrate: {
			...composeExactComponentContracts([Client, client.Reader as AnyComponentFunction], 'client'),
			resumptions: [],
			batch,
			endpoint: '/__exact',
			onMismatch: 'throw',
			onErrorReport: (report) => reports.push(report.error),
			onDiagnostic: (report) => reports.push(report)
		},
		handle: async (request) => {
			requests++;
			const body = request.body as {
				operations?: readonly { arrayCompletion?: number; state?: unknown }[];
				arrayCompletion?: number;
				state?: unknown;
			};
			const operations = body.operations ?? [body];
			expect(operations).toHaveLength(batch ? 2 : 1);
			const submitted = operations.at(-1);
			expect(submitted?.arrayCompletion).toBe(prepared ? 4 : undefined);
			if (prepared && !authored) expect(submitted?.state).toEqual({ rows: [1], item: ' first ' });
			return handleExactRequest(request, { contract });
		}
	});
	onTestFinished(() => {
		view.unmount();
		unmount(host);
	});
	render(
		withComponentDomain(view.client.domain, () => receipt(Client, {})),
		host
	);
	await view.settle();
	await view.action(() => host.querySelector('button')!.click());

	const rejection = 'Cannot send a function in an eXact invocation request';
	const expected = batch
		? authored
			? `${rejection}|${rejection}`
			: 'good|first'
		: authored
			? rejection
			: 'first';
	await expect.poll(() => host.querySelector('output')?.textContent).toBe(expected);
	expect(host.querySelector('[data-rows]')?.textContent).toBe(prepared && !authored ? '2' : '1');
	expect(requests).toBe(authored ? 0 : 1);
	expect(reports).toEqual([]);
});
