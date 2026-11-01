/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { flushSync } from '@exactjs/reactive';
import { findElementOwner } from '@exactjs/dom/testing';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import {
	composeExactExecutorContract,
	handleExactRequest,
	exactResponseToFetchResponse
} from '@exactjs/server';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
it.each(['inferred', 'explicit', 'remote', 'inline'] as const)(
	'publishes %s helper-driven state updates',
	async (mode) => {
		const root = await createCompilerTestWorkspace('.exact-helper-effects-', process.cwd());
		const policy =
			mode === 'inferred'
				? ''
				: `, task:TaskContext=TaskContext.${mode === 'remote' ? 'server' : 'client'}().latest()`;
		const files = await writeTestFiles(root, {
			'leaf.ts': `export function mutate(state: {value:string}, value:string) {state.value=value;}`,
			'helper.ts': `import {mutate} from './leaf.js'; export function apply(state: {left:{value:string};right:{value:string}}, value:string){mutate(state.left,value);mutate(state.right,value+'!');}`,
			'page.tsx': `import {TaskContext,type Component} from '@exactjs/core'; import {apply} from './helper.js';
        export function Page(this:Component<{revision:number;left:{value:string};right:{value:string};untouched:string}>){
            this.state.revision=0;this.state.left={value:'initial'};this.state.right={value:'initial'};this.state.untouched='private-control';
            const run=async(revision:number${policy})=>{if(!revision)return;await Promise.resolve();${mode === 'inline' ? "this.state.left.value=String(revision);this.state.right.value=String(revision)+'!';" : 'apply(this.state,String(revision));'}};
            ${mode === 'inferred' ? 'void run(this.state.revision);' : ''}
            return ()=> <main><button onClick={()=>{this.state.revision++;${mode === 'inferred' ? '' : 'void run(this.state.revision);'}}}>Change</button><output>{this.state.left.value}:{this.state.right.value}</output></main>;
        }`
		});
		const results = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const page = results.find((result) => result.inputFile === files['page.tsx'])!;
		const clientModule = await importArtifact(page.clientFile, path.join(root, 'client.mjs'));
		const serverModule = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
		const ClientPage = clientModule.Page as AnyComponentFunction;
		const ServerPage = serverModule.Page as AnyComponentFunction;
		const registration = composeExactComponentContracts([ClientPage], 'client');
		const contract = composeExactExecutorContract([ServerPage], { endpoint: '/__exact' });
		for (const batch of [false, true]) {
			const rendered = await renderToHydratableString(
				createCompiledComponentInputReceipt(ServerPage, {})
			);
			const container = document.createElement('main');
			container.innerHTML = rendered.htmlWithHydration;
			const output = container.querySelector('output');
			let holdResponses = false;
			const releases: Array<() => void> = [];
			onTestFinished(() => releases.forEach((release) => release()));
			const client = hydrate(createCompiledComponentInputReceipt(ClientPage, {}), container, {
				...registration,
				resumptions: rendered.resumptions,
				endpoint: '/__exact',
				batch,
				fetch: async (url, init) => {
					const response = await handleExactRequest(
						{
							method: init.method,
							url,
							headers: init.headers,
							body: JSON.parse(init.body),
							signal: init.signal
						},
						{ contract, invocations: {} }
					);
					expect(JSON.stringify(response)).not.toContain('private-control');
					if (holdResponses) await new Promise<void>((resolve) => releases.push(resolve));
					return exactResponseToFetchResponse(response);
				}
			});
			onTestFinished(() => client.dispose());
			for (const value of ['1:1!', '2:2!']) {
				container.querySelector('button')!.click();
				await expect.poll(() => output?.textContent).toBe(value);
				expect(container.querySelector('output')).toBe(output);
			}
			if (mode === 'remote') {
				holdResponses = true;
				container.querySelector('button')!.click();
				await expect.poll(() => releases.length).toBe(1);
				container.querySelector('button')!.click();
				await expect.poll(() => releases.length).toBe(2);
				releases[1]!();
				await expect.poll(() => output?.textContent).toBe('4:4!');
				releases[0]!();
				await client.whenSettled();
				expect(output?.textContent).toBe('4:4!');
				container.querySelector('button')!.click();
				await expect.poll(() => releases.length).toBe(3);
				client.dispose();
				releases[2]!();
				await expect(client.whenSettled()).rejects.toMatchObject({ name: 'AbortError' });
				expect(output?.textContent).toBe('4:4!');
			}
			client.dispose();
		}
	}
);
// Write-only leaf grants must prepare request-local parents without transporting
// unrelated state or replacing the client's retained Array and row objects.
it.each(['direct', 'helper'] as const)('publishes transparent %s receiver leaves', async (mode) => {
	const root = await createCompilerTestWorkspace('.exact-transparent-receiver-', process.cwd());
	const files = await writeTestFiles(root, {
		'helper.ts': `export function member(state:{rows:{label:string}[]}){state.rows[0]!.label="changed";}`,
		'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';import {member} from './helper.js';
export function Page(this:Component<{rows:{label:string}[];untouched:string}>){
this.state.rows=[{label:'A'},{label:'B'}];this.state.untouched='private-control';
async function run(task:TaskContext=TaskContext.server().parallel()){${mode === 'helper' ? 'member(this.state);' : 'this.state.rows[0]!.label="changed";'}}
return()=> <main><button onClick={()=>void run()}>Run</button><output>{this.state.rows[0]!.label}:{this.state.rows[1]!.label}</output><aside>{this.state.untouched}</aside></main>;}`
	});
	const results = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const page = results.find((result) => result.inputFile === files['page.tsx'])!;
	const clientModule = await importArtifact(page.clientFile, path.join(root, 'client.mjs'));
	const serverModule = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
	const Client = clientModule.Page as AnyComponentFunction,
		Server = serverModule.Page as AnyComponentFunction;
	const registration = composeExactComponentContracts([Client], 'client');
	const contract = composeExactExecutorContract([Server], { endpoint: '/__exact' });
	const reports: unknown[] = [];
	const frames: unknown[] = [];
	const operations: unknown[] = [];
	const releases: Array<() => void> = [];
	let hold = false;
	const rendered = await renderToHydratableString(createCompiledComponentInputReceipt(Server, {}));
	const host = document.createElement('div');
	onTestFinished(() => host.remove());
	document.body.appendChild(host);
	host.innerHTML = rendered.htmlWithHydration;
	const output = host.querySelector('output')!;
	const client = hydrate(createCompiledComponentInputReceipt(Client, {}), host, {
		...registration,
		resumptions: rendered.resumptions,
		endpoint: '/__exact',
		batch: false,
		onMismatch: 'throw',
		onErrorReport: (report) => reports.push(report.error),
		onDiagnostic: (report) => reports.push(report),
		onOperation: (operation) => operations.push(operation),
		fetch: async (url, init) => {
			const request = {
				method: init.method,
				url,
				headers: init.headers,
				body: JSON.parse(init.body),
				signal: init.signal
			};
			const response = await handleExactRequest(request, {
				contract,
				invocations: {},
				logger: { log: (report) => reports.push(report) }
			});
			frames.push({ request: request.body, response });
			if (hold) await new Promise<void>((resolve) => releases.push(resolve));
			return exactResponseToFetchResponse(response);
		}
	});
	onTestFinished(() => {
		client.dispose();
		releases.forEach((release) => release());
	});
	await client.whenSettled();
	const state = findElementOwner(output)!.state as {
		rows: {
			label: string;
		}[];
		untouched: string;
	};
	const rows = state.rows,
		first = rows[0],
		second = rows[1];
	const snapshot = () => ({
		text: output.textContent,
		untouched: state.untouched,
		sameArray: state.rows === rows,
		sameFirst: state.rows[0] === first,
		sameSecond: state.rows[1] === second,
		sameOutput: host.querySelector('output') === output
	});
	expect(snapshot()).toEqual({
		text: 'A:B',
		untouched: 'private-control',
		sameArray: true,
		sameFirst: true,
		sameSecond: true,
		sameOutput: true
	});
	for (let index = 0; index < 2; index++) {
		if (index === 1) {
			state.rows[0]!.label = 'retry';
			flushSync();
		}
		host.querySelector('button')!.click();
		await client.whenSettled();
		expect(snapshot()).toEqual({
			text: 'changed:B',
			untouched: 'private-control',
			sameArray: true,
			sameFirst: true,
			sameSecond: true,
			sameOutput: true
		});
	}
	expect(JSON.stringify(frames)).not.toContain('private-control');
	expect(frames).toHaveLength(2);
	expect(operations).toHaveLength(2);
	expect(reports).toEqual([]);
	// Disposal fences an already completed server response held by the transport.
	state.rows[0]!.label = 'kept';
	flushSync();
	hold = true;
	host.querySelector('button')!.click();
	await expect.poll(() => releases.length).toBe(1);
	client.dispose();
	releases[0]!();
	await expect(client.whenSettled()).rejects.toMatchObject({ name: 'AbortError' });
	expect(snapshot()).toEqual({
		text: 'kept:B',
		untouched: 'private-control',
		sameArray: true,
		sameFirst: true,
		sameSecond: true,
		sameOutput: false
	});
	expect(reports).toEqual([]);
});
