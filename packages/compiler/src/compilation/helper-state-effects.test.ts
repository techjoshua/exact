/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
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

it.each(['inferred', 'explicit', 'remote', 'inline'] as const)(
	'publishes %s helper-driven state updates',
	async (mode) => {
		const root = await createTestWorkspace('.exact-helper-effects-', process.cwd());
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
				createCompiledComponentReceipt(ServerPage, {})
			);
			const container = document.createElement('main');
			container.innerHTML = rendered.htmlWithHydration;
			const output = container.querySelector('output');
			let holdResponses = false;
			const releases: Array<() => void> = [];
			onTestFinished(() => releases.forEach((release) => release()));
			const client = hydrate(createCompiledComponentReceipt(ClientPage, {}), container, {
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
