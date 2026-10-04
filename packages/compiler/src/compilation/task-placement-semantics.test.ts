/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { hydrate } from '../../../hydrate/src/index.js';
import { renderToHydratableString } from '@exactjs/ssr';
import {
	composeExactExecutorContract,
	exactResponseToFetchResponse,
	handleExactRequest,
	type ExactServerContext
} from '@exactjs/server';
import { compileFileArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(['client', 'server'] as const)(
	'preserves nested %s task results, captured props and failure recovery',
	async (placement) => {
		const root = await createTestWorkspace('.exact-task-placement-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';
/** @exact pure */ export function expected(value:string,suffix:string){if(value==='fail')throw new Error('expected failure');return value+suffix;}
export function Page(this:Component<{label:string;error:string}>,props:{suffix:string}){
this.state.label='initial';this.state.error='';
async function child(value:string,task:TaskContext=TaskContext.${placement}()){await Promise.resolve();return expected(value,props.suffix);}
async function run(value:string,task:TaskContext=TaskContext.client().latest().blocking()){
this.state.error='';try{const first=await child(value);this.state.label=await child(first);}catch{this.state.error='caught';}}
return()=> <main><button data-ok="" onClick={()=>run('ok')}>OK</button><button data-fail="" onClick={()=>run('fail')}>Fail</button><output>{this.state.label}:{this.state.error}</output></main>;}`
		});
		const artifact = await compileFileArtifacts(files['page.tsx']!, {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact.clientFile, path.join(root, 'client.mjs'));
		const server = await importArtifact(artifact.serverFile, path.join(root, 'server.mjs'));
		const contract = composeExactExecutorContract([server.Page as AnyComponentFunction], {
			endpoint: '/__exact'
		});
		const context: ExactServerContext = { contract, invocations: {}, logger: { log() {} } };
		const output = await renderToHydratableString(receipt(server.Page as never, { suffix: '!' }));
		const host = document.createElement('div');
		host.innerHTML = output.html;
		const original = host.querySelector('output');
		const reports: unknown[] = [];
		let requests = 0;
		const mounted = hydrate(receipt(client.Page as never, { suffix: '!' }), host, {
			...composeExactComponentContracts([client.Page as AnyComponentFunction], 'client'),
			resumptions: output.resumptions,
			onMismatch: 'throw',
			onErrorReport: (r) => reports.push(r.error),
			endpoint: '/__exact',
			batch: false,
			fetch: async (url, init) => {
				requests++;
				return exactResponseToFetchResponse(
					await handleExactRequest(
						{
							method: init.method,
							url,
							headers: init.headers,
							body: JSON.parse(init.body),
							signal: init.signal
						},
						context
					)
				);
			}
		});
		onTestFinished(() => mounted.dispose());
		const expected = (value: string, suffix: string) => value + suffix;
		for (const fail of [false, true, false]) {
			host.querySelector<HTMLButtonElement>(fail ? '[data-fail]' : '[data-ok]')!.click();
			await expect
				.poll(() => host.querySelector('output')?.textContent)
				.toBe(
					fail
						? expected(expected('ok', '!'), '!') + ':caught'
						: expected(expected('ok', '!'), '!') + ':'
				);
			expect(host.querySelector('output')).toBe(original);
		}
		expect(requests).toBe(placement === 'server' ? 5 : 0);
		expect(reports).toEqual([]);
		mounted.dispose();
		expect(host.childNodes).toHaveLength(0);
	}
);
