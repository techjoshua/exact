/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { decodeReactiveProtocolValue } from '@exactjs/reactive/framework/protocol';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import {
	composeExactExecutorContract,
	exactResponseToFetchResponse,
	handleExactRequest
} from '@exactjs/server';
import { renderToHydratableString, renderToString } from '@exactjs/ssr';
import { compileFileArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

const packageType = process.env.EXACT_TASK_FIXTURE_MODE === 'library' ? 'library' : 'application';

/** Compiles a task consumer through the paired SDK artifact entry point. */
async function compilePage(source: string) {
	const root = await createTestWorkspace('.exact-task-publication-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': source,
		'tsconfig.json': JSON.stringify({
			extends: path.resolve('packages/compiler/tsconfig.json'),
			compilerOptions: { lib: ['ES2022', 'DOM', 'DOM.Iterable'] },
			files: [],
			include: []
		})
	});
	const artifact = await compileFileArtifacts(files['page.tsx']!, {
		rootDir: root,
		outDir: path.join(root, 'generated'),
		packageType,
		packageName: 'task-activation-publication-fixture',
		generatedValidation: 'semantic'
	});
	return { artifact, root };
}

/** Strictly adopts SSR output and records framework errors and dispatched requests. */
async function hydratePage(source: string) {
	const { artifact, root } = await compilePage(source);
	const [server, client] = await Promise.all([
		importArtifact(artifact.serverFile, path.join(root, 'server.mjs')),
		importArtifact(artifact.clientFile, path.join(root, 'client.mjs'))
	]);
	const serverPage = server.Page as AnyComponentFunction;
	const clientPage = client.Page as AnyComponentFunction;
	const endpoint = '/__exact';
	const contract = composeExactExecutorContract([serverPage], { endpoint });
	const registration = composeExactComponentContracts([clientPage], 'client');
	const rendered = await renderToHydratableString(receipt(serverPage, {}), {
		endpoint,
		continuations: registration.continuations
	});
	const host = document.createElement('main');
	host.innerHTML = rendered.htmlWithHydration;
	const output = host.querySelector('output')!;
	const initial = output.textContent;
	const reports: unknown[] = [];
	const requests: unknown[] = [];
	const responses: { status: number; value: unknown }[] = [];
	const mounted = hydrate(receipt(clientPage, {}), host, {
		...registration,
		endpoint,
		batch: false,
		resumptions: rendered.resumptions,
		onMismatch: 'throw',
		onErrorReport: (report) => reports.push(report.error),
		fetch: async (url, init) => {
			const body = JSON.parse(init.body);
			requests.push(decodeReactiveProtocolValue(body));
			const response = exactResponseToFetchResponse(
				await handleExactRequest(
					{
						method: init.method,
						url,
						headers: init.headers,
						body,
						signal: init.signal
					},
					{ contract, invocations: {} }
				)
			);
			const result = decodeReactiveProtocolValue(await response.clone().json()) as {
				value?: unknown;
			};
			responses.push({ status: response.status, value: result.value });
			return response;
		}
	});
	onTestFinished(() => mounted.dispose());
	return { host, initial, mounted, output, reports, requests, responses, clientPage };
}

it('publishes a computed state write following await in direct server rendering', async () => {
	const { artifact, root } = await compilePage(`
		import {TaskContext,type Component} from '@exactjs/core';
		export function Page(this:Component<{item:{value:number}}>){
			this.state.item={value:1};
			async function prepare(task:TaskContext=TaskContext.server().blocking()){
				function select(item:{value:number}){return item;}
				select(this.state.item);
				const key='value' as const;
				this.state.item[key]+=await Promise.resolve(2);
			}
			prepare();
			return()=>this.state.item.value;
		}`);
	const server = await importArtifact(artifact.serverFile, path.join(root, 'server.mjs'));
	const rendered = await renderToString(receipt(server.Page as AnyComponentFunction, {}));
	const host = document.createElement('div');
	host.innerHTML = rendered.html;
	expect(host.textContent).toBe('3');
});

it.each([false, true])(
	'publishes a setup alias and task writes (retained click: %s)',
	async (live) => {
		const { host, mounted, output, reports } = await hydratePage(`
		import {TaskContext,type Component} from '@exactjs/core';
		export function Page(this:Component<{items:{id:number}[];result:number}>){
			this.state.items=[{id:2}];
			this.state.result=0;
			const items=this.state.items;
			async function load(task:TaskContext=TaskContext.deferred()){
				const first=items[0]!.id;
				this.state.result=first;
				this.state.items.push({id:first});
			}
			load();
			return()=> ${live ? '<main><button onClick={()=>load()}>Load</button>' : ''}
				<output>{this.state.result}:{this.state.items.length}</output>${live ? '</main>' : ''};
		}`);
		await expect.poll(() => output.textContent).toBe('2:2');
		await mounted.whenSettled();
		expect(host.querySelector('output')).toBe(output);
		if (live) {
			host.querySelector('button')!.click();
			await expect.poll(() => output.textContent).toBe('2:3');
			expect(host.querySelector('output')).toBe(output);
		}
		expect(reports).toEqual([]);
	}
);

it.each(['derived', 'snapshot'])(
	'observes slot replacement according to the %s binding',
	async (binding) => {
		const { host, output, reports } = await hydratePage(`
		import {TaskContext,peek,type Component} from '@exactjs/core';
		export function Page(this:Component<{items:{id:number}[];result:number}>){
			this.state.items=[{id:2}];
			this.state.result=0;
			const items=${binding === 'snapshot' ? 'peek(() => this.state.items)' : 'this.state.items'};
			this.state.items=[{id:9}];
			async function load(task:TaskContext=TaskContext.deferred()){
				this.state.result=items[0]!.id;
			}
			load();
			return()=> <main><button onClick={()=>{this.state.result=0;this.state.items=[{id:12}];load();}}>Load</button>
				<output>{this.state.result}:{this.state.items[0]!.id}</output></main>;
		}`);
		await expect.poll(() => output.textContent).toBe(binding === 'snapshot' ? '2:9' : '9:9');
		host.querySelector('button')!.click();
		await expect.poll(() => output.textContent).toBe(binding === 'snapshot' ? '2:12' : '12:12');
		expect(host.querySelector('output')).toBe(output);
		expect(reports).toEqual([]);
	}
);

it('publishes isomorphic startup once and responds to the next input', async () => {
	const { host, initial, mounted, output, reports, requests, clientPage } = await hydratePage(`
		import {TaskContext,type Component} from '@exactjs/core';
		export function Page(this:Component<{query:string;result:string}>){
			this.state.query='first';
			this.state.result='';
			const load=async(query:string)=>{
				await Promise.resolve();
				this.state.result+=query.toUpperCase();
			};
			load(this.state.query);
			return()=> <main><button onClick={()=>{this.state.query='second';}}>Change</button>
				<output>{this.state.result}</output></main>;
		}`);
	expect(['', 'FIRST']).toContain(initial);
	await expect.poll(() => output.textContent).toBe('FIRST');
	await mounted.whenSettled();
	expect(output.textContent).toBe('FIRST');
	host.querySelector('button')!.click();
	await expect.poll(() => output.textContent).toBe('FIRSTSECOND');
	expect(host.querySelector('output')).toBe(output);
	expect(requests).toEqual([]);
	expect(reports).toEqual([]);

	const fresh = document.createElement('div');
	onTestFinished(() => unmount(fresh));
	render(receipt(clientPage, {}), fresh, {
		batch: false,
		onErrorReport: (report) => reports.push(report.error)
	});
	await expect.poll(() => fresh.querySelector('output')?.textContent).toBe('FIRST');
	fresh.querySelector('button')!.click();
	await expect.poll(() => fresh.querySelector('output')?.textContent).toBe('FIRSTSECOND');
	expect(reports).toEqual([]);
});

it('keeps mapped server child calls on the server and publishes their results in the browser', async () => {
	const previousTitle = document.title;
	onTestFinished(() => {
		document.title = previousTitle;
	});
	const { host, initial, mounted, output, reports, requests, responses } = await hydratePage(`
		import {TaskContext,type Component} from '@exactjs/core';
		import {basename} from 'node:path';
		export function Page(this:Component<{ids:string[];result:string}>){
			this.state.ids=['/reports/one','/reports/two'];
			this.state.result='waiting';
			function load(id:string, task:TaskContext=TaskContext.server().parallel()){
				return basename(id);
			}
			async function refresh(task:TaskContext=TaskContext.client().latest()){
				const values=await Promise.all(this.state.ids.map(id=>load(id)));
				const result=values.join(':');
				document.title=result;
				this.state.result=result;
			}
			refresh();
			return()=> <main><button onClick={()=>{this.state.ids=['/reports/three'];void refresh();}}>Next</button>
				<output>{this.state.result}</output></main>;
		}`);
	expect(initial).toBe('waiting');
	await expect.poll(() => output.textContent).toBe('one:two');
	expect(document.title).toBe('one:two');
	host.querySelector('button')!.click();
	await expect.poll(() => output.textContent).toBe('three');
	await mounted.whenSettled();
	expect(document.title).toBe('three');
	expect(requests).toHaveLength(responses.length);
	expect(requests).toEqual(
		expect.arrayContaining(
			['/reports/one', '/reports/two', '/reports/three'].map((id) =>
				expect.objectContaining({
					type: 'invoke',
					payload: expect.objectContaining({ dependencies: [id] })
				})
			)
		)
	);
	expect(responses).toHaveLength(3);
	expect(responses).toEqual(
		expect.arrayContaining(['one', 'two', 'three'].map((value) => ({ status: 200, value })))
	);
	expect(host.querySelector('output')).toBe(output);
	expect(reports).toEqual([]);
});

it('uses a peeked setup value without subscribing to its source', async () => {
	const { host, mounted, output, reports } = await hydratePage(`
		import {peek,TaskContext,type Component} from '@exactjs/core';
		function parse(value:string){return value+'!';}
		function normalize(value:string){return '['+value+']';}
		export function Page(this:Component<{url:string;result:string;runs:number}>){
			this.state.url='first';
			this.state.result='';
			this.state.runs=0;
			const parsed=parse(this.state.url);
			const request=peek(()=>normalize(parsed));
			function publish(task:TaskContext=TaskContext.latest()){
				this.state.result=request;
				this.state.runs++;
			}
			publish();
			return()=> <main><button onClick={()=>{this.state.url='second';}}>Change</button>
				<output>{this.state.url}:{this.state.result}:{this.state.runs}</output></main>;
		}`);
	await mounted.whenSettled();
	expect(output.textContent).toBe('first:[first!]:1');
	host.querySelector('button')!.click();
	await expect.poll(() => output.textContent).toBe('second:[first!]:1');
	await mounted.whenSettled();
	expect(output.textContent).toBe('second:[first!]:1');
	expect(host.querySelector('output')).toBe(output);
	expect(reports).toEqual([]);
});

it.each([
	['portable', '', ''],
	['isolated descriptor', 'Object.defineProperty({}, "Promise", {value: class Foreign{}});', ''],
	[
		'dormant browser work',
		'Object.defineProperty({}, "Promise", {value: class Foreign{}});',
		"const dormant=()=>{document.title='dormant'};"
	],
	[
		'reached browser work',
		'Object.defineProperty({}, "Promise", {value: class Foreign{}});',
		"document.title='executor';"
	]
])('runs a saved Promise resolver with %s', async (name, setup, executor) => {
	const source = (placement: 'server' | 'client') => `
		import {type Component, TaskContext} from '@exactjs/core';
		function select(){${setup}
			const value={};
			const steps:string[]=[];
			let notify:(value:object)=>void=()=>undefined;
			const pending=new Promise<object>(resolve=>{
				${executor}
				steps.push('executor');
				notify=resolve;
			});
			steps.push('constructed');
			const observed=pending.then(result=>steps.push(result===value?'same':'different'));
			notify(value);
			steps.push('notified');
			return observed.then(()=>steps.join(','));
		}
		export function Page(this:Component<{label:string}>){
			this.state.label='';
			const run=async(task:TaskContext=TaskContext.${placement}())=>{this.state.label=await select()};
			return ()=> <main><button onClick={()=>run()}>Run</button><output>{this.state.label}</output></main>
		}`;
	const reached = name === 'reached browser work';
	if (reached) {
		await expect(compilePage(source('server'))).rejects.toThrow(/browser-only globals/);
	}
	const title = document.title;
	onTestFinished(() => {
		document.title = title;
	});
	document.title = 'before';
	const { host, mounted, output, reports, requests } = await hydratePage(
		source(reached ? 'client' : 'server')
	);
	host.querySelector('button')!.click();
	await expect.poll(() => output.textContent).toBe('executor,constructed,notified,same');
	await mounted.whenSettled();
	expect(host.querySelector('output')).toBe(output);
	expect(requests).toHaveLength(reached ? 0 : 1);
	expect(reports).toEqual([]);
	expect(document.title).toBe(reached ? 'executor' : 'before');
});

it.each([
	['inferred dormant value', 'latest', '() => { document.title = "dormant"; }', 'before', 0],
	['inferred static class', 'latest', 'class { static { document.title += "!"; } }', 'before!!', 0],
	['explicit server', 'server', 'class {}', 'before', 2]
] as const)(
	'publishes a task after a discarded property definition with %s',
	async (_name, placement, value, expectedTitle, requestCount) => {
		const title = document.title;
		onTestFinished(() => {
			document.title = title;
		});
		document.title = 'before';
		const { host, mounted, output, reports, requests } = await hydratePage(`
		import {type Component, TaskContext} from '@exactjs/core';
		function select() {
			Object.defineProperty({}, 'item', {value: ${value}});
			return 'done';
		}
		export function Page(this: Component<{label: string}>) {
			this.state.label = 'initial';
			function run(task: TaskContext = TaskContext.${placement}()) {
				this.state.label = select();
			}
			return () => <main><button onClick={() => run()}>Run</button><output>{this.state.label}</output></main>;
		}`);
		expect(output.textContent).toBe('initial');
		const button = host.querySelector('button')!;
		for (let click = 0; click < 2; click++) {
			button.click();
			await expect.poll(() => output.textContent).toBe('done');
			await mounted.whenSettled();
			expect(host.querySelector('output')).toBe(output);
		}
		expect(document.title).toBe(expectedTitle);
		expect(requests).toHaveLength(requestCount);
		expect(reports).toEqual([]);
	}
);
