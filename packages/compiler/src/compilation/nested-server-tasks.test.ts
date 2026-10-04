/** @vitest-environment jsdom */
import path from 'node:path';
import ts from 'typescript';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import {
	composeExactExecutorContract,
	handleExactRequest,
	exactResponseToFetchResponse
} from '@exactjs/server';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(['literal', 'reactive', 'awaited', 'default'] as const)(
	'publishes a setup task result with %s arguments',
	async (mode) => {
		const root = await createTestWorkspace('.exact-setup-result-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';export ${mode === 'awaited' ? 'async ' : ''}function Page(this:Component<{value:number}>,props:{input:number}){this.state.value=0;function run(value:number${mode === 'default' ? '=props.input' : ''},task:TaskContext=TaskContext.server().blocking()){return value+1;}this.state.value=${mode === 'awaited' ? 'await ' : ''}run(${mode === 'default' ? '' : mode === 'literal' ? '1' : 'props.input'});return()=> <output>{this.state.value}</output>;}`
		});
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated'),
			generatedValidation: 'semantic'
		});
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		for (const input of [1, 7]) {
			const rendered = await renderToHydratableString(
				createCompiledComponentReceipt(server.Page as AnyComponentFunction, { input })
			);
			const host = document.createElement('div');
			host.innerHTML = rendered.html;
			expect(host.querySelector('output')?.textContent).toBe(
				String((mode === 'literal' ? 1 : input) + 1)
			);
		}
	}
);

it.each(['setup', 'mixed', 'remote'] as const)(
	'executes nested server tasks during %s',
	async (mode) => {
		const root = await createTestWorkspace('.exact-nested-tasks-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';
        export function Page(this:Component<{value:string;child:string}>){
            this.state.value='initial';this.state.child='initial';
            async function leaf(text:string,task:TaskContext=TaskContext.server()) {
                await Promise.resolve();
                if(text==='fail')throw new Error('expected child failure');
                this.state.child=text;return text+'!';
            }
            async function middle(text:string,task:TaskContext=TaskContext.server()) {
                return await leaf(text);
            }
            async function prepare(text:string,task:TaskContext=TaskContext.server().blocking()) {
                try { this.state.value=await middle(text); }
                catch { this.state.value='recovered'; }
            }
            ${mode !== 'remote' ? "void prepare('ready');" : ''}
            return ()=> <main>${mode === 'setup' ? '' : "<button onClick={()=>prepare('ready')}>Run</button><button onClick={()=>prepare('fail')}>Fail</button>"}<output>{this.state.value}:{this.state.child}</output></main>;
        }`
		});
		const results = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const page = results.find((result) => result.inputFile === files['page.tsx'])!;
		if (mode === 'remote') {
			const consumers = await writeTestFiles(root, {
				'consumer.ts': `import {testServerComponent} from '@exactjs/testing'; import {Page} from './generated/page.exact.server.js'; void testServerComponent(Page);`
			});
			const program = ts.createProgram(
				[page.clientFile, page.serverFile, consumers['consumer.ts']!],
				{
					target: ts.ScriptTarget.ES2022,
					module: ts.ModuleKind.NodeNext,
					moduleResolution: ts.ModuleResolutionKind.NodeNext,
					skipLibCheck: true,
					noEmit: true,
					types: ['node']
				}
			);
			expect(
				ts
					.getPreEmitDiagnostics(program)
					.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
			).toEqual([]);
		}
		const serverModule = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
		const ServerPage = serverModule.Page as AnyComponentFunction;
		const rendered = await renderToHydratableString(
			createCompiledComponentReceipt(ServerPage, {}),
			{
				maxAsyncSsrConcurrency: 1
			}
		);
		const container = document.createElement('main');
		container.innerHTML = rendered.htmlWithHydration;
		expect(container.querySelector('output')?.textContent).toBe(
			mode !== 'remote' ? 'ready!:ready' : 'initial:initial'
		);
		if (mode === 'setup') return;
		const clientModule = await importArtifact(page.clientFile, path.join(root, 'client.mjs'));
		const ClientPage = clientModule.Page as AnyComponentFunction;
		const contract = composeExactExecutorContract([ServerPage], { endpoint: '/__exact' });
		const client = hydrate(createCompiledComponentReceipt(ClientPage, {}), container, {
			...composeExactComponentContracts([ClientPage], 'client'),
			resumptions: rendered.resumptions,
			endpoint: '/__exact',
			fetch: async (url, init) =>
				exactResponseToFetchResponse(
					await handleExactRequest(
						{
							method: init.method,
							url,
							headers: init.headers,
							body: JSON.parse(init.body),
							signal: init.signal
						},
						{ contract, invocations: {} }
					)
				)
		});
		onTestFinished(() => client.dispose());
		for (const [index, value] of [
			[0, 'ready!:ready'],
			[1, 'recovered:ready'],
			[0, 'ready!:ready']
		] as const) {
			container.querySelectorAll('button')[index]!.click();
			await client.whenSettled();
			await expect.poll(() => container.querySelector('output')?.textContent).toBe(value);
		}
	}
);

it.each(['primitive', 'promise', 'union'] as const)(
	'publishes a %s client setup result without losing settlement semantics',
	async (mode) => {
		const root = await createTestWorkspace('.exact-sync-setup-result-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>,props:{input:number}){this.state.value=0;function run(value:number,task:TaskContext=TaskContext.client()){return ${mode === 'primitive' ? 'value+1' : mode === 'promise' ? 'Promise.resolve(value+1)' : 'value>0 ? Promise.resolve(value+1) : value+1'};}this.state.value=run(props.input);return()=> <output>{this.state.value}</output>;}`
		});
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated'),
			generatedValidation: 'semantic'
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const host = document.createElement('div');
		onTestFinished(() => {
			unmount(host);
		});
		render(createCompiledComponentReceipt(client.Page as AnyComponentFunction, { input: 1 }), host);
		if (mode === 'primitive') expect(host.querySelector('output')?.textContent).toBe('2');
		await expect.poll(() => host.querySelector('output')?.textContent).toBe('2');
	}
);
