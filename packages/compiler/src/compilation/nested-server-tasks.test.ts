/** @vitest-environment jsdom */
import path from 'node:path';
import ts from 'typescript';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
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
import { createCompilerTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { serverChildFacadesSource } from '../test-support/server-child-facades.js';
import { serverChildShorthandSource } from '../test-support/server-child-shorthand.js';
it.each(['literal', 'reactive', 'awaited', 'default'] as const)(
	'publishes a setup task result with %s arguments',
	async (mode) => {
		const root = await createCompilerTestWorkspace('.exact-setup-result-', process.cwd());
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
				createCompiledComponentInputReceipt(server.Page as AnyComponentFunction, { input })
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
		const root = await createCompilerTestWorkspace('.exact-nested-tasks-', process.cwd());
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
			createCompiledComponentInputReceipt(ServerPage, {}),
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
		const client = hydrate(createCompiledComponentInputReceipt(ClientPage, {}), container, {
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
		const root = await createCompilerTestWorkspace('.exact-sync-setup-result-', process.cwd());
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
		render(
			createCompiledComponentInputReceipt(client.Page as AnyComponentFunction, { input: 1 }),
			host
		);
		if (mode === 'primitive') expect(host.querySelector('output')?.textContent).toBe('2');
		await expect.poll(() => host.querySelector('output')?.textContent).toBe('2');
	}
);
it('cancels a request-owned child after await and permits the next interaction', async () => {
	const root = await createCompilerTestWorkspace('.exact-child-facade-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';
export const releases:(()=>void)[]=[];export const observations:string[]=[];
export function Page(this:Component<{value:number}>){this.state.value=0;
 async function child(task:TaskContext=TaskContext.server().parallel()){
  task.cleanup(()=>{observations.push('child-cleanup');});
  await new Promise<void>(resolve=>releases.push(resolve));
  observations.push('late-child-write');this.state.value=99;
 }
 async function parent(task:TaskContext=TaskContext.server().parallel()){
  const observed=child().catch(()=>-1);
  await Promise.resolve();child.cancel('expected');await observed;
  this.state.value++;
 }
 return()=> <button onClick={()=>parent()}/>;
}`
	});
	const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const contract = composeExactExecutorContract([server.Page as AnyComponentFunction]);
	const operation = Object.values(contract.invocations).find(
		(entry) => entry.stateReads.some((read) => read.path === 'value') && entry.stateWrites.length
	)!;
	const observations = server.observations as string[];
	const releases = server.releases as (() => void)[];
	const reports: unknown[] = [];
	onTestFinished(() => {
		for (const release of releases) release();
	});
	for (const value of [0, 1]) {
		const response = await handleExactRequest(
			{
				method: 'POST',
				url: 'http://localhost/__exact',
				headers: { origin: 'http://localhost', 'content-type': 'application/json' },
				body: {
					type: 'invoke',
					id: operation.id,
					state: { value },
					payload: { dependencies: [], generation: value + 1 }
				}
			},
			{
				contract,
				invocations: {},
				logger: {
					isEnabled: () => true,
					log: (report) => reports.push(report)
				}
			}
		);
		expect(response.status).toBe(200);
		expect(JSON.parse(response.body as string)).toMatchObject({
			ok: true,
			state: { value: value + 1 }
		});
		for (const release of releases) release();
		await Promise.resolve();
		await Promise.resolve();
		expect(observations).toEqual(Array(value + 1).fill('child-cleanup'));
	}
	expect(reports).toEqual([]);
});
it('retains child facade lanes across direct SSR parent activations', async () => {
	const root = await createCompilerTestWorkspace('.exact-direct-child-facades-', process.cwd());
	const files = await writeTestFiles(root, { 'page.tsx': serverChildFacadesSource });
	const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const releases = server.releases as (() => void)[];
	onTestFinished(() => {
		for (const release of releases) release();
	});
	const reports: unknown[] = [];
	const rendered = await renderToHydratableString(
		createCompiledComponentInputReceipt(server.Page as AnyComponentFunction, {}),
		{ logger: { isEnabled: () => true, log: (report) => reports.push(report) } }
	);
	expect(rendered.html).toContain('<output>8</output>');
	expect(server.snapshots).toEqual([
		['initial', 1, false, 0, 0, undefined, undefined],
		['running', true, 1],
		['success', false, 0, 1, 7, undefined],
		['error', false, 0, 2, 7, 'expected-direct-error'],
		['canceled', false, 0, 3, 7, undefined],
		['later', false, 0, 4, 7],
		['separate', 4, 1, 7, 19],
		['initial', 2, false, 0, 4, 7, undefined],
		['repeated', false, 0, 5, 7]
	]);
	for (const release of releases) release();
	await Promise.resolve();
	await Promise.resolve();
	expect(server.late).toEqual([]);
	expect((server.cleaned as string[]).filter((value) => value === 'child:success')).toHaveLength(3);
	expect(server.cleaned).toEqual(
		expect.arrayContaining(['child:cancel', 'separate', 'parent:1', 'parent:2', 'drive'])
	);
	expect(reports).toEqual([]);
});
it('retains task identity, status and cancellation through stable aliases and shorthand values', async () => {
	const root = await createCompilerTestWorkspace('.exact-child-shorthand-', process.cwd());
	const files = await writeTestFiles(root, { 'page.tsx': serverChildShorthandSource });
	const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const reports: unknown[] = [];
	const rendered = await renderToHydratableString(
		createCompiledComponentInputReceipt(server.Page as AnyComponentFunction, {}),
		{ logger: { isEnabled: () => true, log: (report) => reports.push(report) } }
	);
	expect(rendered.html).toContain('<output>7</output>');
	expect(server.snapshots).toEqual([
		['identity', true, true, true, true],
		['mutable', true, 29],
		['idle', false, false, false, false, false, false, false, false],
		['running', true, true, true, true, true, true, true, true],
		['done', 7, 7, 7, 7, 7, 7, 7, 7],
		['ordinary', 23],
		['canceled', -1, false, 2]
	]);
	expect(reports).toEqual([]);
});

it.each([
	[
		'Inferred',
		'import { TaskContext, type Component } from "@exactjs/core";\nexport function Probe(this: Component<{ count: number }>) {\n this.state.count=0;\n async function onServer(task: TaskContext = TaskContext.server()): Promise<string> { return process.cwd(); }\n const refresh=async (count: number) => { if(count===0)return; const value=await onServer(); if(value==="go") location.assign("/"); };\n void refresh(this.state.count);\n return () => <button onClick={() => this.state.count++}>Run</button>;\n}\n'
	],
	[
		'Explicit',
		'import { TaskContext, type Component } from "@exactjs/core";\nexport function Probe(this: Component<{ count: number }>) {\n this.state.count=0;\n async function onServer(task: TaskContext = TaskContext.server()): Promise<string> { return process.cwd(); }\n const refresh=async (count: number, _task: TaskContext = TaskContext.client()) => { if(count===0)return; const value=await onServer(); if(value==="go") location.assign("/"); };\n void refresh(this.state.count);\n return () => <button onClick={() => this.state.count++}>Run</button>;\n}\n'
	],
	[
		'NamedExplicit',
		'import { TaskContext, type Component } from "@exactjs/core";\nexport function Probe(this: Component<{ count: number }>) {\n this.state.count=0;\n async function onServer(task: TaskContext = TaskContext.server()): Promise<string> { return process.cwd(); }\n async function refresh(count: number, _task: TaskContext = TaskContext.client()) { if(count===0)return; const value=await onServer(); if(value==="go") location.assign("/"); }\n void refresh(this.state.count);\n return () => <button onClick={() => this.state.count++}>Run</button>;\n}\n'
	],
	[
		'Imported',
		'import { TaskContext, type Component } from "@exactjs/core";\nimport { work } from "./server.js";\nexport function Probe(this: Component<{ count: number }>) {\n this.state.count=0;\n async function onServer(task: TaskContext = TaskContext.server()): Promise<string> { return work("test"); }\n const refresh=async (count: number) => { if(count===0)return; const value=await onServer(); if(value==="go") location.assign("/"); };\n void refresh(this.state.count);\n return () => <button onClick={() => this.state.count++}>Run</button>;\n}\n'
	]
])(
	'checks setup activation dependency types with nested server work (%s)',
	async (_name, source) => {
		const root = await createCompilerTestWorkspace('.exact-typed-activation-', process.cwd());
		const files = await writeTestFiles(root, {
			'tsconfig.json':
				'{"compilerOptions":{"target":"ES2022","module":"NodeNext","jsx":"react-jsx","jsxImportSource":"@exactjs/jsx","strict":true,"skipLibCheck":true,"types":["node"]},"include":["*.tsx"]}',
			'page.tsx': source,
			'server.ts':
				'import { resolve } from "node:path";\nfunction defaults() { return { directory: resolve(process.cwd(),"data") }; }\nexport async function work(input:string, deps=defaults()):Promise<string> { return deps.directory+input; }\n'
		});
		const artifacts = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: root,
			serverComponents: true,
			generatedValidation: 'semantic'
		});
		expect(artifacts.some((value) => value.inputFile === files['page.tsx'])).toBe(true);
	}
);
