/** @vitest-environment jsdom */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import {
	callbackTaskCases,
	callbackTaskHelper,
	callbackTaskSource
} from '../test-support/task-callback-sources.js';
import { expect, it, onTestFinished } from 'vitest';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import type { AnyComponentFunction } from '@exactjs/core';
import { composeExactExecutorContract, handleExactRequest } from '@exactjs/server';
import { compileProjectArtifacts } from '../index.js';
import { createBrowserTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
it.each(['mount', 'hydrate'])(
	'retains a compiled child started by an owned timer during %s',
	async (mode) => {
		const root = await createBrowserTestWorkspace('.exact-callback-child-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `import { TaskContext, type Component } from '@exactjs/core';
export let started=false, finished=false;
export const completions:Promise<void>[]=[];
let releaseChild!:()=>void, releaseBody!:()=>void;
export function release(){releaseChild?.();releaseBody?.();}
export function Page(this:Component<{value:number}>){this.state.value=0;
async function child(task:TaskContext=TaskContext.client()){
started=true;await new Promise<void>(resolve=>{releaseChild=resolve;});this.state.value=1;
}
async function parent(task:TaskContext=TaskContext.client()){
setTimeout(()=>{child();releaseBody();},0);
await new Promise<void>(resolve=>{releaseBody=resolve;});
}
return()=> <main><button onClick={()=>completions.push(Promise.resolve(parent()).then(()=>{finished=true;}))}>Start</button><output>{this.state.value}</output></main>;
}`
		});
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const host = document.createElement('div');
		const reports: unknown[] = [];
		let dispose: (() => void) | undefined;
		onTestFinished(async () => {
			(client.release as () => void)();
			await Promise.allSettled(client.completions as Promise<void>[]);
			dispose?.();
			unmount(host);
		});
		const errors = { onErrorReport: (report: { error: unknown }) => reports.push(report.error) };
		if (mode === 'hydrate') {
			const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
			const output = await renderToHydratableString(receipt(server.Page as never, {}));
			host.innerHTML = output.html;
			const view = hydrate(receipt(client.Page as never, {}), host, {
				...composeExactComponentContracts([client.Page as AnyComponentFunction], 'client'),
				...errors,
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
			dispose = () => view.dispose();
		} else render(receipt(client.Page as never, {}), host, errors);
		const output = host.querySelector('output');
		host.querySelector('button')!.click();
		await expect.poll(() => client.started).toBe(true);
		// Cross a host turn after the producer has completed while the child is still held.
		await new Promise((resolve) => setTimeout(resolve, 0));
		const premature = client.finished;
		(client.release as () => void)();
		await Promise.all(client.completions as Promise<void>[]);
		expect(premature).toBe(false);
		expect(client.finished).toBe(true);
		expect(host.querySelector('output')).toBe(output);
		await expect.poll(() => output?.textContent).toBe('1');
		expect(reports).toEqual([]);
	}
);

// Acquired callback effects stay behind the actual child execution owner. Real caller
// arguments and invalid effects inside either owner must still be diagnosed.
for (const example of callbackTaskCases) {
	it(`preserves callback execution ownership: ${example.name}`, async () => {
		const root = await createBrowserTestWorkspace('.exact-task-callback-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': callbackTaskSource(example),
			'helper.ts': callbackTaskHelper(example.form)
		});
		const compile = () =>
			compileProjectArtifacts([files['page.tsx']!], {
				rootDir: root,
				outDir: path.join(root, 'generated'),
				serverComponents: true,
				generatedValidation: 'semantic'
			});
		if ('invalid' in example) {
			await expect(compile()).rejects.toThrow('EXACT2001');
			return;
		}
		const [artifact] = await compile();
		expect(artifact).toBeDefined();
		const [client, server] = await Promise.all([
			readFile(artifact!.clientFile, 'utf8'),
			readFile(artifact!.serverFile, 'utf8')
		]);
		expect(client).not.toContain('node:path');
		expect(server).toContain('auditOnServer');
		if (example.name === 'named callback') {
			const loaded = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
			const contract = composeExactExecutorContract([loaded.Page as AnyComponentFunction]);
			const [operation] = Object.values(contract.invocations);
			expect(Object.values(contract.invocations)).toHaveLength(1);
			expect(operation!.dependencies.map((value) => value.source)).toEqual(['argument']);
			const response = await handleExactRequest(
				{
					method: 'POST',
					url: 'http://localhost/__exact',
					headers: { origin: 'http://localhost', 'content-type': 'application/json' },
					body: {
						type: 'invoke',
						id: operation!.id,
						state: { revision: 0, draft: '' },
						payload: { dependencies: [':input'], generation: 1 }
					}
				},
				{ contract, invocations: {} }
			);
			expect(response.status).toBe(200);
			expect(JSON.parse(response.body as string)).toMatchObject({
				ok: true,
				value: path.resolve(process.cwd(), 'data') + ':input'
			});
		}
	});
}

it.each([
	{ name: 'explicit value', args: 'input, 5', gets: 0 },
	{ name: 'omitted value', args: 'input', gets: 1 },
	{ name: 'explicit undefined', args: 'input, undefined', gets: 1 }
])('checks a helper default getter at its task invocation ($name)', async ({ args, gets }) => {
	const root = await createBrowserTestWorkspace('.exact-task-default-', process.cwd());
	const compile = async (placement: 'client' | 'server') => {
		const files = await writeTestFiles(root, {
			'page.tsx': `import {TaskContext, type Component} from '@exactjs/core';
export let reads = 0;
const input = { get value() { reads++; return window.innerWidth; } };
const read = (input: {value: number}, value = input.value) => value;
export function Page(this: Component<{label:number}>) {
	this.state.label = 0;
	const run = (task:TaskContext = TaskContext.${placement}()) => { this.state.label = read(${args}); };
	return () => <button onClick={() => run()}>{this.state.label}</button>;
}`
		});
		return compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, placement),
			generatedValidation: 'semantic'
		});
	};
	if (gets) await expect(compile('server')).rejects.toThrow(/EXACT2001.*browser-only globals/);
	else expect(await compile('server')).toHaveLength(1);

	const [artifact] = await compile('client');
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const host = document.createElement('div');
	onTestFinished(() => unmount(host));
	render(receipt(client.Page as AnyComponentFunction, {}), host);
	expect(client.reads).toBe(0);
	const button = host.querySelector('button')!;
	button.click();
	await expect.poll(() => button.textContent).toBe(String(gets ? window.innerWidth : 5));
	expect(client.reads).toBe(gets);
});
