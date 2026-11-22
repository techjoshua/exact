/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { compileFileArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

it.each(
	(['application', 'library'] as const).flatMap((packageType) =>
		[false, true].map((blocking) => ({ packageType, blocking }))
	)
)(
	'publishes primitive task startup once ($packageType, blocking=$blocking)',
	async ({ packageType, blocking }) => {
		const root = await createTestWorkspace('.exact-task-primitive-startup-', process.cwd());
		const files = await writeTestFiles(root, {
			'tsconfig.json': JSON.stringify({
				extends: path.resolve('packages/compiler/tsconfig.json'),
				compilerOptions: { lib: ['ES2022', 'DOM', 'DOM.Iterable'] },
				files: [],
				include: []
			}),
			'page.tsx': `
			import {${blocking ? 'TaskContext,' : ''}type Component} from '@exactjs/core';
			export function Page(this:Component<{query:string;result:string}>){
				this.state.query='first';
				this.state.result='';
				const load=async(query:string${blocking ? ',task:TaskContext=TaskContext.blocking()' : ''})=>{
					await Promise.resolve();
					this.state.result+=query.toUpperCase();
				};
				load(this.state.query);
				return()=> <main><button onClick={()=>{this.state.query='second';}}>Change</button>
					<output>{this.state.result}</output></main>;
			}`
		});
		const artifact = await compileFileArtifacts(files['page.tsx']!, {
			rootDir: root,
			outDir: path.join(root, 'generated'),
			packageName: 'task-primitive-startup-fixture',
			packageType,
			generatedValidation: 'semantic'
		});
		const [server, client] = await Promise.all([
			importArtifact(artifact.serverFile, path.join(root, 'server.mjs')),
			importArtifact(artifact.clientFile, path.join(root, 'client.mjs'))
		]);
		const clientPage = client.Page as AnyComponentFunction;
		const registration = composeExactComponentContracts([clientPage], 'client');
		const rendered = await renderToHydratableString(
			receipt(server.Page as AnyComponentFunction, {}),
			{
				continuations: registration.continuations
			}
		);
		const host = document.createElement('div');
		host.innerHTML = rendered.htmlWithHydration;
		const output = host.querySelector('output')!;
		expect(blocking ? ['FIRST'] : ['', 'FIRST']).toContain(output.textContent);
		const reports: unknown[] = [];
		const requests: unknown[] = [];
		const mounted = hydrate(receipt(clientPage, {}), host, {
			...registration,
			batch: false,
			resumptions: rendered.resumptions,
			onMismatch: 'throw',
			onErrorReport: (report) => reports.push(report.error),
			fetch: async (url) => {
				requests.push(url);
				throw new Error('An isomorphic startup task issued a continuation request');
			}
		});
		onTestFinished(() => mounted.dispose());

		await expect.poll(() => output.textContent).toBe('FIRST');
		await mounted.whenSettled();
		expect(output.textContent).toBe('FIRST');
		host.querySelector('button')!.click();
		await expect.poll(() => output.textContent).toBe('FIRSTSECOND');
		expect(host.querySelector('output')).toBe(output);

		const fresh = document.createElement('div');
		onTestFinished(() => unmount(fresh));
		render(receipt(clientPage, {}), fresh, {
			batch: false,
			onErrorReport: (report) => reports.push(report.error)
		});
		await expect.poll(() => fresh.querySelector('output')?.textContent).toBe('FIRST');
		fresh.querySelector('button')!.click();
		await expect.poll(() => fresh.querySelector('output')?.textContent).toBe('FIRSTSECOND');
		expect(requests).toEqual([]);
		expect(reports).toEqual([]);
	}
);
