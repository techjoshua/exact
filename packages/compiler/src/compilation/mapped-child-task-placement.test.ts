/** @vitest-environment jsdom */
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { decodeReactiveProtocolValue } from '@exactjs/reactive/framework/protocol';
import { hydrate } from '@exactjs/hydrate';
import {
	composeExactExecutorContract,
	exactResponseToFetchResponse,
	handleExactRequest
} from '@exactjs/server';
import { renderToHydratableString } from '@exactjs/ssr';
import { compileFileArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

/** Compiles a task consumer through the paired SDK artifact entry point. */
async function compilePage(source: string, packageType: 'application' | 'library') {
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
		packageType,
		outDir: path.join(root, 'generated'),
		generatedValidation: 'semantic'
	});
	return { artifact, root };
}

/** Strictly adopts SSR output and records framework errors and dispatched requests. */
async function hydratePage(source: string, packageType: 'application' | 'library') {
	const { artifact, root } = await compilePage(source, packageType);
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
	document.body.append(host);
	onTestFinished(() => host.remove());
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
	return { host, initial, mounted, output, reports, requests, responses };
}

/** Builds the same task consumer with either a direct call or a mapper. */
function pageSource(invocation: string) {
	return `
		import {TaskContext,type Component} from '@exactjs/core';
		import {basename,dirname} from 'node:path';
		export function Page(this:Component<{ids:string[];result:string}>, props:{other?:(id:string)=>string}){
			this.state.ids=['/reports/one','/reports/two'];
			this.state.result='waiting';
			function load(id:string, task:TaskContext=TaskContext.server().parallel()){
				return basename(id);
			}
			async function refresh(task:TaskContext=TaskContext.client().latest()){
				document.title='';
				const values=${invocation};
				const result=values.join(':');
				document.title=result;
				this.state.result=result;
			}
			refresh();
			return()=> <main><button onClick={()=>{this.state.ids=['/reports/three'];void refresh();}}>Next</button>
				<button onClick={()=>{this.state.ids=['/reports/four','/reports/five'];void refresh();}}>More</button>
				<output>{this.state.result}</output></main>;
		}`;
}

/** Checks the exact argument and HTTP result multiset for one interaction. */
function expectDispatches(
	requests: unknown[],
	responses: unknown[],
	dependencies: string[],
	values: string[]
) {
	expect(requests).toHaveLength(dependencies.length);
	expect(requests).toEqual(
		expect.arrayContaining(
			dependencies.map((id) =>
				expect.objectContaining({
					type: 'invoke',
					payload: expect.objectContaining({ dependencies: [id] })
				})
			)
		)
	);
	expect(responses).toHaveLength(values.length);
	expect(responses).toEqual(
		expect.arrayContaining(values.map((value) => ({ status: 200, value })))
	);
}

describe.each(['application', 'library'] as const)('%s', (packageType) => {
	it.each([
		{
			mode: 'direct',
			invocation: "[(await load(this.state.ids[0]! + (document.title = '!')))]",
			initialValue: 'one!',
			initialRequests: ['/reports/one!'],
			initialResponses: ['one!'],
			moreRequests: ['/reports/four!'],
			moreResponses: ['four!']
		},
		{
			mode: 'mapped',
			invocation:
				"await Promise.all(this.state.ids.map(id=>{document.title+='!';return load(id+document.title);}))",
			initialValue: 'one!:two!!',
			initialRequests: ['/reports/one!', '/reports/two!!'],
			initialResponses: ['one!', 'two!!'],
			moreRequests: ['/reports/four!', '/reports/five!!'],
			moreResponses: ['four!', 'five!!']
		}
	])(
		'dispatches $mode server child calls and retains the hydrated output',
		async ({
			invocation,
			initialValue,
			initialRequests,
			initialResponses,
			moreRequests,
			moreResponses
		}) => {
			const previousTitle = document.title;
			onTestFinished(() => {
				document.title = previousTitle;
			});
			const { host, initial, mounted, output, reports, requests, responses } = await hydratePage(
				pageSource(invocation),
				packageType
			);
			expect(initial).toBe('waiting');
			await expect.poll(() => output.textContent).toBe(initialValue);
			expect(document.title).toBe(initialValue);
			await mounted.whenSettled();
			expectDispatches(requests, responses, initialRequests, initialResponses);
			host.querySelector('button')!.click();
			await expect.poll(() => output.textContent).toBe('three!');
			await mounted.whenSettled();
			expect(document.title).toBe('three!');
			expectDispatches(
				requests.slice(initialRequests.length),
				responses.slice(initialResponses.length),
				['/reports/three!'],
				['three!']
			);
			host.querySelectorAll('button')[1]!.click();
			await expect.poll(() => output.textContent).toBe(moreResponses.join(':'));
			await mounted.whenSettled();
			expect(document.title).toBe(moreResponses.join(':'));
			expectDispatches(
				requests.slice(initialRequests.length + 1),
				responses.slice(initialResponses.length + 1),
				moreRequests,
				moreResponses
			);
			expect(host.querySelector('output')).toBe(output);
			expect(reports).toEqual([]);
		}
	);

	it.each([
		{
			mode: 'child argument',
			invocation: 'await Promise.all(this.state.ids.map(id=>load(dirname(id))))'
		},
		{
			mode: 'mixed callable alternative',
			invocation: `await Promise.all(this.state.ids.map(id=>{
				const selected=id.length>8 ? load : (path:string)=>dirname(path);
				return selected(id);
			}))`
		},
		{
			mode: 'unresolved callable alternative',
			invocation: `await Promise.all(this.state.ids.map(id=>{
				const selected=props.other ?? ((path:string)=>dirname(path));
				return selected(id);
			}))`
		},
		{
			mode: 'shadowed callback-local function',
			invocation: `await Promise.all(this.state.ids.map(id=>{
			const pending=load(id);
			{
				const load=(path:string)=>dirname(path);
				document.title=load(id);
			}
			return pending;
		}))`
		}
	])('reports the server dependency in a $mode', async ({ invocation }) => {
		await expect(compilePage(pageSource(invocation), packageType)).rejects.toThrow(
			/EXACT2001:.*task requests client placement but references server-only imports.*server-only import dirname/u
		);
	});
});
