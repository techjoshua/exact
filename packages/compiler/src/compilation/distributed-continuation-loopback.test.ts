/**
 * @vitest-environment jsdom
 */
import { type AnyComponentFunction, type ContextToken } from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import '@exactjs/core/runtime/refs';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { createExactClient, hydrate, type FetchLike } from '@exactjs/hydrate';
import { createExactRoot } from '@exactjs/hydrate/internal';
import {
	exactResponseToFetchResponse,
	composeExactExecutorContract,
	handleExactRequest,
	runWithExactRequestScope,
	type ExactInvocationRequest,
	type ExactResponseLike,
	type ExactServerContext
} from '@exactjs/server';
import { createExactServerRuntime, renderToHydratableString } from '@exactjs/ssr';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi, onTestFinished } from 'vitest';
import { compileFileArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { artifactAnalysis } from './analysis-results.js';
describe('@exactjs/compiler distributed continuation loopback', () => {
	it.each(['application', 'library'] as const)(
		'publishes an awaited compound write through a literal key binding (%s)',
		async (packageType) => {
			const root = await createCompilerTestWorkspace('.exact-task-computed-write-', process.cwd());
			const source = path.join(root, 'page.tsx');
			await writeFile(
				source,
				`import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{item:{value:number;other:number}}>){
 this.state.item={value:1,other:10};
 async function prepare(task:TaskContext=TaskContext.server().blocking()){
  function select(item:{value:number}){return item;}
  select(this.state.item);
  const key='value' as const;
  this.state.item[key]+=await Promise.resolve(2);
 }
 async function extend(amount:number,task:TaskContext=TaskContext.server().latest()){
  const key='value' as const;
  this.state.item[key]+=await Promise.resolve(amount);
 }
 prepare();
 return()=> <main><button data-extend onClick={()=>extend(4)}>Extend</button><button data-replace onClick={()=>extend(8)}>Replace</button><output>{this.state.item.value}:{this.state.item.other}</output></main>;
}`
			);
			const compiled = await compileFileArtifacts(source, {
				rootDir: root,
				outDir: path.join(root, 'generated'),
				generatedValidation: 'semantic',
				packageType
			});
			const ClientPage = componentExport(
				await importArtifact(compiled.clientFile, path.join(root, 'client.mjs')),
				'Page'
			);
			const ServerPage = componentExport(
				await importArtifact(compiled.serverFile, path.join(root, 'server.mjs')),
				'Page'
			);
			const registration = composeExactComponentContracts([ClientPage], 'client');
			const endpoint = '/__exact';
			const server: ExactServerContext = {
				contract: composeExactExecutorContract([ServerPage], { endpoint }),
				invocations: {}
			};
			const rendered = await renderToHydratableString(
				createCompiledComponentInputReceipt(ServerPage, {}),
				{ endpoint, continuations: registration.continuations }
			);
			const container = document.createElement('div');
			container.innerHTML = rendered.htmlWithHydration;
			const output = container.querySelector('output')!;
			expect(output.textContent).toBe('3:10');

			const reports: unknown[] = [];
			const requests: ExactInvocationRequest[] = [];
			const send = loopbackFetch(server, requests);
			let holdResponse = false;
			let releaseResponse: (() => void) | undefined;
			let heldSignal: AbortSignal | undefined;
			const client = hydrate(createCompiledComponentInputReceipt(ClientPage, {}), container, {
				...registration,
				endpoint,
				resumptions: rendered.resumptions,
				onMismatch: 'throw',
				onErrorReport: (report) => reports.push(report.error),
				batch: false,
				fetch: async (input, init) => {
					const held = holdResponse;
					holdResponse = false;
					const response = await send(input, init);
					if (held) {
						heldSignal = init.signal;
						await new Promise<void>((resolve) => {
							releaseResponse = resolve;
						});
					}
					return response;
				}
			});
			onTestFinished(() => {
				releaseResponse?.();
				client.dispose();
			});
			click(container, '[data-extend]');
			await expect.poll(() => output.textContent).toBe('7:10');
			expect(container.querySelector('output')).toBe(output);
			expect(requests).toHaveLength(1);

			holdResponse = true;
			click(container, '[data-extend]');
			await expect.poll(() => releaseResponse).toBeTypeOf('function');
			click(container, '[data-replace]');
			await expect.poll(() => output.textContent).toBe('15:10');
			expect(heldSignal?.aborted).toBe(true);
			releaseResponse!();
			await client.whenSettled();
			expect(output.textContent).toBe('15:10');
			expect(container.querySelector('output')).toBe(output);
			expect(requests).toHaveLength(3);
			expect(reports).toEqual([]);
		}
	);
	it.each([
		{ invocation: 'optimistic()', clientEffect: false },
		{ invocation: 'helper.optimistic()', clientEffect: false },
		{ invocation: "helper['optimistic']()", clientEffect: false },
		{ invocation: 'impostor.optimistic()', clientEffect: false },
		{ invocation: 'importedOptimistic(effects)', clientEffect: false },
		{ invocation: "task.optimistic(()=>effects.push('client'))", clientEffect: true },
		{ invocation: "(task.optimistic(()=>effects.push('client')))", clientEffect: true },
		{
			invocation: "task.optimistic(()=>{const label='client'; effects.push(label)})",
			clientEffect: true
		},
		{ invocation: "task['optimistic'](()=>effects.push('client'))", clientEffect: true },
		{
			invocation: "const alias=task; alias.optimistic(()=>effects.push('client'))",
			clientEffect: true
		},
		{
			invocation: "const {optimistic: apply}=task; apply(()=>effects.push('client'))",
			clientEffect: true
		}
	])('preserves capability ownership for $invocation', async ({ invocation, clientEffect }) => {
		const root = await createCompilerTestWorkspace('.exact-optimistic-name-', process.cwd());
		const source = path.join(root, 'page.tsx');
		await writeFile(
			path.join(root, 'helper.ts'),
			"export function importedOptimistic(effects:string[]){effects.push('server');}"
		);
		await writeFile(
			source,
			`import {TaskContext as FrameworkTaskContext, type Component} from '@exactjs/core';
import {importedOptimistic} from './helper.js';
interface TaskContext {optimistic():void}
export const effects:string[]=[];
let runs=0;
function optimistic(){effects.push('server');}
const helper={optimistic};
const impostor:TaskContext={optimistic};
export function Page(this:Component<{value:string}>){
 this.state.value='initial';
 async function load(task:FrameworkTaskContext=FrameworkTaskContext.server().latest()){
  ${invocation}
  await Promise.resolve();
  this.state.value='complete'+(++runs);
 }
 return()=> <main><button onClick={()=>load()}>Load</button><output>{this.state.value}</output></main>;
}`
		);
		const compiled = await compileFileArtifacts(source, { rootDir: root, outDir: root });
		const clientModule = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
		const serverModule = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
		const ClientPage = componentExport(clientModule, 'Page');
		const ServerPage = componentExport(serverModule, 'Page');
		const server: ExactServerContext = {
			contract: composeExactExecutorContract([ServerPage], { endpoint: '/__exact' }),
			invocations: {},
			logger: { log() {} }
		};
		const rendered = await renderToHydratableString(
			createCompiledComponentInputReceipt(ServerPage, {})
		);
		const container = document.createElement('div');
		container.innerHTML = rendered.html;
		const reports: unknown[] = [];
		const client = hydrate(createCompiledComponentInputReceipt(ClientPage, {}), container, {
			...composeExactComponentContracts([ClientPage], 'client'),
			resumptions: rendered.resumptions,
			onMismatch: 'throw',
			onErrorReport: (report) => reports.push(report.error),
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
						server
					)
				)
		});
		onTestFinished(() => client.dispose());
		for (let i = 0; i < 2; i++) {
			click(container, 'button');
			await expect
				.poll(() => container.querySelector('output')?.textContent)
				.toBe('complete' + (i + 1));
			expect(serverModule.effects).toEqual(clientEffect ? [] : Array(i + 1).fill('server'));
			expect(clientModule.effects).toEqual(clientEffect ? Array(i + 1).fill('client') : []);
		}
		expect(reports).toEqual([]);
	});
	it.each([
		"const local='public'; task.optimistic(()=>this.state.value=local)",
		"const {value:local}={value:'public'}; const alias=task; alias.optimistic(()=>this.state.value=local)",
		"const callback=()=>{this.state.value='public';}; task.optimistic(callback)"
	])('diagnoses server-task locals unavailable to the optimistic prelude: %s', async (body) => {
		const root = await createCompilerTestWorkspace('.exact-optimistic-capture-', process.cwd());
		const source = path.join(root, 'page.tsx');
		await writeFile(
			source,
			`import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{value:string}>){this.state.value='initial';
async function load(task:TaskContext=TaskContext.server().latest()){${body};await Promise.resolve();}
return()=> <button onClick={()=>load()}>{this.state.value}</button>;}`
		);
		await expect(compileFileArtifacts(source, { rootDir: root, outDir: root })).rejects.toThrow(
			/EXACT2001:.*optimistic callback cannot capture a server-task local/u
		);
	});
	it('diagnoses optimistic extraction hidden inside server control flow', async () => {
		const root = await createCompilerTestWorkspace(
			'.exact-optimistic-control-flow-',
			process.cwd()
		);
		const source = path.join(root, 'page.tsx');
		await writeFile(
			source,
			`import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{value:number}>){this.state.value=0;
async function load(task:TaskContext=TaskContext.server().latest()){if(this.state.value===0)task.optimistic(()=>this.state.value=1);await Promise.resolve();}
return()=> <button onClick={()=>load()}>{this.state.value}</button>;}`
		);
		await expect(compileFileArtifacts(source, { rootDir: root, outDir: root })).rejects.toThrow(
			/EXACT2001:.*must be a direct statement/u
		);
	});
	it.each([false, true])(
		'keeps credentials out of generated task request and response bytes (batch: %s)',
		async (batch) => {
			const credential = 'PRIVATE-generated-credential-café-🙂';
			const readCredential = vi.fn(() => credential);
			vi.stubGlobal('__exactReadTestCredential', readCredential);
			onTestFinished(() => {
				vi.unstubAllGlobals();
			});
			const root = await createCompilerTestWorkspace('.exact-secret-loopback-', process.cwd());
			const source = path.join(root, 'page.tsx');
			await writeFile(
				source,
				`import {TaskContext,type Component} from '@exactjs/core';
		import {consume,type Secret} from '@exactjs/secrets';
		declare function __exactReadTestCredential():Secret<string>;
		async function publicResult(credential:string){if(!credential)throw new Error('Missing credential');await Promise.resolve();return 'Public result';}
		export function Page(this:Component<{label:string}>){
		 this.state.label='Waiting';
		 const load=async(_task:TaskContext=TaskContext.server())=>{
		  const credential=__exactReadTestCredential();
		  this.state.label=await publicResult(consume(credential));
		 };
		 return()=> <main><button onClick={()=>load()}>Load</button><output>{this.state.label}</output></main>;
		}`
			);
			const compiled = await compileFileArtifacts(source, { rootDir: root, outDir: root });
			expect(await readFile(compiled.clientFile, 'utf8')).not.toContain(credential);
			const clientModule = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
			const serverModule = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
			const ClientPage = componentExport(clientModule, 'Page');
			const ServerPage = componentExport(serverModule, 'Page');
			const registration = composeExactComponentContracts([ClientPage], 'client');
			const contract = composeExactExecutorContract([ServerPage], { endpoint: '/__exact' });
			const server: ExactServerContext = { contract, invocations: {}, logger: { log() {} } };
			const rendered = await renderToHydratableString(
				createCompiledComponentInputReceipt(ServerPage, {})
			);
			expect(JSON.stringify(rendered)).not.toContain(credential);
			const container = document.createElement('main');
			container.innerHTML = rendered.html;
			const requestBytes: string[] = [];
			const responseBytes: string[] = [];
			const client = hydrate(createCompiledComponentInputReceipt(ClientPage, {}), container, {
				...registration,
				resumptions: rendered.resumptions,
				endpoint: '/__exact',
				batch,
				logger: { log() {} },
				fetch: async (url, init) => {
					requestBytes.push(init.body);
					expect(init.body).not.toContain(credential);
					const response = exactResponseToFetchResponse(
						await handleExactRequest(
							{
								method: init.method,
								url,
								headers: init.headers,
								body: JSON.parse(init.body),
								signal: init.signal
							},
							server
						)
					);
					const bytes = await response.clone().text();
					responseBytes.push(bytes);
					expect(bytes).not.toContain(credential);
					return response;
				}
			});
			onTestFinished(() => client.dispose());
			for (let index = 0; index < 2; index++) {
				click(container, 'button');
				await expect.poll(() => readCredential.mock.calls.length).toBe(index + 1);
				await expect.poll(() => responseBytes.length).toBe(index + 1);
				await expect
					.poll(() => container.querySelector('output')?.textContent)
					.toBe('Public result');
			}
			expect(requestBytes).toHaveLength(2);
			expect(responseBytes.join('')).toContain('Public result');
			expect(readCredential).toHaveBeenCalledTimes(2);
		}
	);
	it.each([false, true])(
		'propagates generated server rejection and permits recovery (batch: %s)',
		async (batch) => {
			const root = await createCompilerTestWorkspace('.exact-rejection-loopback-', process.cwd());
			const source = path.join(root, 'page.tsx');
			await writeFile(
				source,
				`import {TaskContext, type Component} from '@exactjs/core';
			export function Page(this: Component<{value: string; error: string}>) {
				this.state.value = 'initial'; this.state.error = '';
				async function load(value: string, task: TaskContext = TaskContext.server()) {
					if (value === 'fail') throw new Error('private failure');
					return value;
				}
				async function run(value: string, task: TaskContext = TaskContext.client().latest()) {
					this.state.error = '';
					try { this.state.value = await load(value); this.state.value = await load(value + '2'); }
					catch { this.state.error = 'caught'; }
				}
				return () => <main><button id="ok" onClick={() => void run('ok')}>OK</button><button id="fail" onClick={() => void run('fail')}>Fail</button><button id="recover" onClick={() => void run('recovered')}>Recover</button><output>{this.state.value}:{this.state.error}</output></main>;
			}`
			);
			const compiled = await compileFileArtifacts(source, { rootDir: root, outDir: root });
			const clientModule = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
			const serverModule = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
			const ClientPage = componentExport(clientModule, 'Page');
			const ServerPage = componentExport(serverModule, 'Page');
			const registration = composeExactComponentContracts([ClientPage], 'client');
			const contract = composeExactExecutorContract([ServerPage], { endpoint: '/__exact' });
			const logger = { log() {} };
			const server: ExactServerContext = { contract, invocations: {}, logger };
			const rendered = await renderToHydratableString(
				createCompiledComponentInputReceipt(ServerPage, {})
			);
			const container = document.createElement('main');
			container.innerHTML = rendered.html;
			const client = hydrate(createCompiledComponentInputReceipt(ClientPage, {}), container, {
				...registration,
				resumptions: rendered.resumptions,
				endpoint: '/__exact',
				batch,
				logger,
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
							server
						)
					)
			});
			onTestFinished(() => client.dispose());
			for (const [selector, expected] of [
				['#ok', 'ok2:'],
				['#fail', 'ok2:caught'],
				['#recover', 'recovered2:']
			]) {
				click(container, selector!);
				await expect.poll(() => container.querySelector('output')?.textContent).toBe(expected);
			}
		}
	);
	it('resumes compiled SSR work and advances the server task after a client change', async () => {
		const root = await createCompilerTestWorkspace('.exact-continuation-loopback-', process.cwd());
		const sourceRoot = path.join(root, 'src');
		const generatedRoot = path.join(root, 'generated');
		const source = path.join(sourceRoot, 'search.tsx');
		await mkdir(sourceRoot, { recursive: true });
		await writeFile(
			source,
			'import { TaskContext } from "@exactjs/core";\n\n\t\t\t\timport { createContext, type Component } from "@exactjs/core";\n\n\t\t\t\tconst StatusContext = createContext<{ message: string }>("status", {\n\t\t\t\t\tkeep: "shared"\n\t\t\t\t});\n\n\t\t\t\tfunction Status(this: Component<{}>) {\n\t\t\t\t\tconst status = this.getContext(StatusContext);\n\t\t\t\t\treturn () => <output data-status>{status.message}</output>;\n\t\t\t\t}\n\n\t\t\t\texport function Search(this: Component<{ query: string; result: string }>) {\n\t\t\t\t\tthis.state.query = "first";\n\t\t\t\t\tthis.state.result = "waiting";\n\n\t\t\t\t\tconst runFixtureTask = async (query: string, _task: TaskContext = TaskContext.server()) => {\n\t\t\t\t\t\t\n\t\t\t\t\t\tawait Promise.resolve();\n\t\t\t\t\t\tconst result = query.toUpperCase();\n\t\t\t\t\t\tthis.state.result = result;\n\t\t\t\t\t\tthis.setContext(StatusContext, { message: result });\n\t\t\t\t\t};\nrunFixtureTask(this.state.query);\n\n\t\t\t\t\treturn () => (\n\t\t\t\t\t\t<label>\n\t\t\t\t\t\t\tQuery\n\t\t\t\t\t\t\t<button\n\t\t\t\t\t\t\t\ttype="button"\n\t\t\t\t\t\t\t\tonClick={() => {\n\t\t\t\t\t\t\t\t\tthis.state.query = "second";\n\t\t\t\t\t\t\t\t}}\n\t\t\t\t\t\t\t>\n\t\t\t\t\t\t\t\tChange\n\t\t\t\t\t\t\t</button>\n\t\t\t\t\t\t\t<output>{this.state.result}</output>\n\t\t\t\t\t\t\t<Status />\n\t\t\t\t\t\t</label>\n\t\t\t\t\t);\n\t\t\t\t}\n\t\t\t'
		);
		const compiled = await compileFileArtifacts(source, {
			outDir: generatedRoot,
			rootDir: sourceRoot
		});
		const clientModule = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
		const serverModule = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
		const ClientSearch = componentExport(clientModule, 'Search');
		const ServerSearch = componentExport(serverModule, 'Search');
		const clientContracts = composeExactComponentContracts([ClientSearch], 'client');
		const serverContract = composeExactExecutorContract([ServerSearch], {
			endpoint: '/__exact'
		});
		const requests: ExactInvocationRequest[] = [];
		const server: ExactServerContext = {
			contract: serverContract,
			invocations: {}
		};
		const rendered = await renderToHydratableString(
			createCompiledComponentInputReceipt(ServerSearch, {}),
			{
				endpoint: '/__exact',
				continuations: clientContracts.continuations,
				buildKey: 'loopback-build'
			}
		);
		expect(rendered.html).toContain('FIRST');
		const resumptions = rendered.resumptions ?? [];
		expect(resumptions).toEqual([
			expect.objectContaining({
				values: expect.objectContaining({ result: 'FIRST' }),
				contexts: { StatusContext: { message: 'FIRST' } }
			})
		]);
		expect(resumptions[0]?.values).not.toHaveProperty('query');
		const container = document.createElement('main');
		container.innerHTML = rendered.htmlWithHydration;
		const serverOutput = container.querySelector('output');
		const serverStatus = container.querySelector('[data-status]');
		const client = hydrate(createCompiledComponentInputReceipt(ClientSearch, {}), container, {
			endpoint: '/__exact',
			buildKey: 'loopback-build',
			batch: false,
			continuations: clientContracts.continuations,
			fetch: loopbackFetch(server, requests),
			logger: {
				log(event) {
					if (event.error !== undefined) throw event.error;
				}
			},
			onErrorReport(report) {
				throw report.error;
			}
		});
		await client.whenSettled();
		expect(container.innerHTML).toContain('FIRST');
		expect(container.querySelector('output')?.textContent).toBe('FIRST');
		expect(container.querySelector('output')).toBe(serverOutput);
		expect(container.querySelector('[data-status]')).toBe(serverStatus);
		expect(serverStatus?.textContent).toBe('FIRST');
		expect(requests).toHaveLength(0);
		container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await vi.waitFor(() => expect(requests).toHaveLength(1));
		await client.whenSettled();
		expect(container.querySelector('output')?.textContent).toBe('SECOND');
		expect(container.querySelector('[data-status]')?.textContent).toBe('SECOND');
		expect(requests[0]).toMatchObject({
			type: 'invoke',
			root: 'page',
			payload: { dependencies: ['second'] }
		});
		client.dispose();
	});
	it('keeps direct server-context dependencies out of client activation records', async () => {
		const root = await createCompilerTestWorkspace('.exact-continuation-context-', process.cwd());
		const source = path.join(root, 'panel.tsx');
		await writeFile(
			source,
			`import { createContext, TaskContext, type Component } from '@exactjs/core';

			/** @exact server */
			export const DatabaseContext = createContext<{
				find(id: string): Promise<{ title: string }>;
			}>('panel database', { scope: 'request' });

			export function Panel(this: Component<{ id: string; title: string }>) {
				this.state.id = 'first';
				this.state.title = 'Loading';
				const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
					const row = await this.getContext(DatabaseContext).find(this.state.id);
					this.state.title = row.title;
				};
				load();
				return () => <button onClick={() => this.state.id = 'next'}>{this.state.title}</button>;
			}`
		);

		const compiled = await compileFileArtifacts(source, { rootDir: root, outDir: root });
		const analysis = artifactAnalysis(compiled);
		expect(analysis.continuations).toEqual([
			expect.objectContaining({
				placement: 'server',
				activation: expect.objectContaining({
					dependencies: [{ index: 0, source: 'state', path: 'this.state.id' }],
					stateReads: [{ path: 'id', kind: 'read', confidence: 'exact' }],
					serverContexts: [{ token: 'DatabaseContext', kind: 'read', confidence: 'exact' }],
					publicContexts: []
				}),
				effects: expect.objectContaining({
					stateWrites: [{ path: 'title', kind: 'write', confidence: 'exact' }]
				})
			})
		]);

		const clientModule = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
		const serverModule = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
		const ClientPanel = componentExport(clientModule, 'Panel');
		const ServerPanel = componentExport(serverModule, 'Panel');
		const database = serverModule.DatabaseContext as ContextToken<{
			find(id: string): Promise<{ title: string }>;
		}>;
		const find = vi
			.fn<(id: string) => Promise<{ title: string }>>()
			.mockResolvedValueOnce({ title: 'Initial title' })
			.mockResolvedValueOnce({ title: 'Title from continuation' });
		const registration = composeExactComponentContracts([ClientPanel], 'client');
		const server = createExactServerRuntime({
			contract: composeExactExecutorContract([ServerPanel], { endpoint: '/__exact' }),
			requestContexts: [[database, { create: () => ({ find }) }]]
		});
		onTestFinished(() => server.dispose?.());

		const rendered = await runWithExactRequestScope(
			{ method: 'GET', url: 'https://example.test/' },
			server,
			(context) =>
				renderToHydratableString(createCompiledComponentInputReceipt(ServerPanel, {}), {
					contexts: context.contexts?.componentValues,
					signal: context.signal
				})
		);
		expect(rendered.html).toContain('Initial title');
		expect(find.mock.calls).toEqual([['first']]);
		expect(clientModule).not.toHaveProperty('DatabaseContext');

		const requests: ExactInvocationRequest[] = [];
		const container = document.createElement('main');
		const client = createExactClient(container, {
			...registration,
			resumptions: [],
			endpoint: '/__exact',
			batch: false,
			fetch: loopbackFetch(server, requests)
		});
		onTestFinished(() => client.dispose());
		onTestFinished(() => unmount(container));
		render(createCompiledComponentInputReceipt(ClientPanel, {}), container, {
			componentDomain: client.domain
		});
		await expect
			.poll(() => container.querySelector('button')?.textContent)
			.toBe('Title from continuation');
		expect(find.mock.calls).toEqual([['first'], ['first']]);
		expect(requests).toHaveLength(1);
		expect(requests[0]?.id).toBe(analysis.continuations[0]?.id);
		expect(requests[0]?.payload).toEqual({ dependencies: ['first'], generation: 1 });
		expect(requests[0]?.state).toEqual({ id: 'first' });
		expect(requests[0]?.publicContext).toBeUndefined();
	});

	it('routes compiled server tasks through the client owned by each hidden root', async () => {
		const root = await createCompilerTestWorkspace('.exact-hidden-root-loopback-', process.cwd());
		const billing = await compileRemoteTask(root, 'billing');
		const branding = await compileRemoteTask(root, 'branding');
		const buildKey = '0123456789abcdef0123456789abcdef01234567';
		const exchanges: Array<{
			body: ExactInvocationRequest;
			binding: string | null;
			build: string | null;
			signal: AbortSignal | undefined;
		}> = [];
		const servers = new Map([
			[billing.root, remoteServer(billing, buildKey)],
			[branding.root, remoteServer(branding, buildKey)]
		]);
		let holdResponsesUntilAbort = false;
		const fetch: FetchLike = async (input, init) => {
			const body = JSON.parse(init.body) as ExactInvocationRequest;
			const headers = new Headers(init.headers);
			exchanges.push({
				body,
				binding: headers.get('x-exact-binding'),
				build: headers.get('x-exact-build'),
				signal: init.signal
			});
			const server = servers.get(String(body.root));
			if (!server) throw new Error(`Unexpected hidden execution root ${String(body.root)}`);
			const privateHeaders = new Headers(init.headers);
			privateHeaders.delete('x-exact-binding');
			const response = await handleExactRequest(
				{
					method: init.method,
					url: input,
					headers: privateHeaders,
					body,
					signal: init.signal
				},
				server
			);
			const signal = init.signal;
			if (holdResponsesUntilAbort && signal && !signal.aborted)
				await new Promise<void>((resolve) =>
					signal.addEventListener('abort', () => resolve(), { once: true })
				);
			return responseLike(response);
		};
		const container = document.createElement('main');
		const billingContainer = document.createElement('div');
		const brandingContainer = document.createElement('div');
		container.append(billingContainer, brandingContainer);
		document.body.append(container);
		const hiddenRoots = [
			{ fixture: billing, host: billingContainer },
			{ fixture: branding, host: brandingContainer }
		];
		const clients: ReturnType<typeof createExactClient>[] = [];
		// Use the same hidden-root boundary as the remote wrapper with a controlled transport.
		const mountHiddenRoots = () => {
			for (const { fixture, host } of hiddenRoots) {
				const client = createExactClient(host, {
					endpoint: '/__exact',
					executionRoot: fixture.root,
					binding: fixture.name,
					buildKey,
					fetch,
					onErrorReport: ({ error }) => {
						throw error;
					}
				});
				clients.push(client);
				client.registerComponents(fixture.registration);
				render(createExactRoot(client, fixture.client, { name: fixture.name }), host);
			}
		};
		const unmountHiddenRoots = () => {
			for (const { host } of hiddenRoots) unmount(host);
			for (const client of clients.splice(0)) client.dispose();
		};
		const expectedRoutes = hiddenRoots.map(({ fixture }) => ({
			root: fixture.root,
			binding: fixture.name,
			build: buildKey
		}));
		const assertRoutes = () => {
			const routes = exchanges.map(({ body, binding, build }) => ({
				root: body.root,
				binding,
				build
			}));
			expect(routes).toHaveLength(expectedRoutes.length);
			expect(routes).toEqual(expect.arrayContaining(expectedRoutes));
		};
		try {
			mountHiddenRoots();
			await vi.waitFor(() => {
				expect(
					container.querySelector('[data-result="billing"]')?.textContent,
					container.innerHTML
				).toBe('BILLING-READY');
				expect(container.querySelector('[data-result="branding"]')?.textContent).toBe(
					'BRANDING-READY'
				);
			});
			assertRoutes();
			exchanges.length = 0;
			click(container, '[data-task="billing"]');
			click(container, '[data-task="branding"]');
			await vi.waitFor(() => {
				expect(container.querySelector('[data-result="billing"]')?.textContent).toBe(
					'BILLING-NEXT'
				);
				expect(container.querySelector('[data-result="branding"]')?.textContent).toBe(
					'BRANDING-NEXT'
				);
			});
			assertRoutes();
			// Exercise disposal while the requests are still owned. Settled task frames deliberately
			// release their controllers so completed requests do not remain retained until unmount.
			unmountHiddenRoots();
			holdResponsesUntilAbort = true;
			exchanges.length = 0;
			mountHiddenRoots();
			await vi.waitFor(assertRoutes);
			const signals = exchanges.map((exchange) => exchange.signal);
			expect(signals.map((signal) => signal?.aborted)).toEqual([false, false]);
			unmountHiddenRoots();
			expect(signals.map((signal) => signal?.aborted)).toEqual([true, true]);
		} finally {
			unmountHiddenRoots();
			container.remove();
		}
	});
});
async function compileRemoteTask(root: string, name: string) {
	const sourceRoot = path.join(root, name, 'src');
	const generatedRoot = path.join(root, name, 'generated');
	const source = path.join(sourceRoot, 'RemoteTask.tsx');
	await mkdir(sourceRoot, { recursive: true });
	await writeFile(
		source,
		`import { TaskContext, type Component } from '@exactjs/core';

		export function RemoteTask(
			this: Component<{ query: string; result: string }>,
			props: { name: string }
		) {
			this.state.query = props.name + '-ready';
			this.state.result = 'waiting';
			const runFixtureTask = async (query: string, _task: TaskContext = TaskContext.server()) => {
				await Promise.resolve();
				this.state.result = query.toUpperCase();
			};
			runFixtureTask(this.state.query);
			return () => (
				<section>
					<button data-task={props.name} onClick={() => this.state.query = props.name + '-next'}>
						Run
					</button>
					<output data-result={props.name}>{this.state.result}</output>
				</section>
			);
		}`
	);
	const compiled = await compileFileArtifacts(source, {
		outDir: generatedRoot,
		rootDir: sourceRoot
	});
	expect(artifactAnalysis(compiled).components).toEqual([
		expect.objectContaining({
			name: 'RemoteTask',
			placement: 'isomorphic',
			artifactTargets: ['client', 'server']
		})
	]);
	const clientModule = await importArtifact(
		compiled.clientFile,
		path.join(root, name, 'client.mjs')
	);
	const serverModule = await importArtifact(
		compiled.serverFile,
		path.join(root, name, 'server.mjs')
	);
	const client = componentExport(clientModule, 'RemoteTask');
	const server = componentExport(serverModule, 'RemoteTask');
	const clientContract = composeExactComponentContracts([client], 'client');
	const serverContract = composeExactExecutorContract([server], { endpoint: '/__exact' });
	return {
		name,
		root: `@exactjs/hidden-${name}#./RemoteTask`,
		client,
		registration: { continuations: clientContract.continuations },
		serverContract
	};
}
function remoteServer(
	fixture: Awaited<ReturnType<typeof compileRemoteTask>>,
	buildKey: string
): ExactServerContext {
	return {
		contract: { version: 1, invocations: {}, boundaries: {} },
		remoteBuilds: {
			[buildKey]: {
				buildKey,
				roots: {
					[fixture.root]: {
						contract: fixture.serverContract,
						invocations: {}
					}
				}
			}
		},
		authorize: () => true
	};
}
/** Bundles one generated target while retaining the workspace runtime as shared package imports. */
/** Reads one expected generated component export without coupling to its private descriptor. */
function componentExport(module: Record<string, unknown>, name: string): AnyComponentFunction {
	const component = module[name];
	if (typeof component !== 'function')
		throw new Error(`Missing generated component export ${name}`);
	return component as AnyComponentFunction;
}
/** Adapts the browser transport directly to the runtime-neutral server request handler. */
function loopbackFetch(server: ExactServerContext, requests: ExactInvocationRequest[]): FetchLike {
	return async (input, init) => {
		const body = JSON.parse(init.body) as ExactInvocationRequest;
		requests.push(body);
		const response = await handleExactRequest(
			{
				method: init.method,
				url: input,
				headers: init.headers,
				body,
				signal: init.signal
			},
			server
		);
		return responseLike(response);
	};
}
function responseLike(response: ExactResponseLike): Awaited<ReturnType<FetchLike>> {
	return {
		ok: response.status >= 200 && response.status < 300,
		status: response.status,
		headers: {
			get(name) {
				const expected = name.toLowerCase();
				const entry = Object.entries(response.headers).find(
					([key]) => key.toLowerCase() === expected
				);
				return entry?.[1] ?? null;
			}
		},
		async json() {
			return await exactResponseToFetchResponse(response).json();
		}
	};
}
function click(container: Element, selector: string): void {
	const element = container.querySelector(selector);
	if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
	element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
