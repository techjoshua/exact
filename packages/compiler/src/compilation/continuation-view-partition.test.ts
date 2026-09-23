/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { composeExactExecutorContract, handleExactRequest } from '@exactjs/server';
import { createExactServerRuntime, renderToHydratableString } from '@exactjs/ssr';
import { mountClientServerTest } from '@exactjs/testing';
import type { AnyComponentFunction, Child } from '@exactjs/core';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(['inline', 'helper'] as const)(
	'adopts a complete continuation owner with a %s view',
	async (viewShape) => {
		const root = await createTestWorkspace('.exact-partition-view-', process.cwd());
		const markup = `<section><button id="ok" onClick={handlers.ok}>OK</button><button id="fail" onClick={handlers.fail}>Fail</button><output>{state.value}:{state.error}</output></section>`;
		const files = await writeTestFiles(root, {
			'inputs.ts': `export function inputs(state: {revision: number; mode: string}) { return {ok: () => {state.mode=state.revision?'recovered':'ok'; state.revision++;}, fail: () => {state.mode='fail'; state.revision++;}}; }`,
			'service.server.ts': `import { basename } from 'node:path'; export function read(value: string) { if (value === 'fail') throw new Error('Failed'); return basename('/reports/' + value); }`,
			'view.tsx': `export function view(state: {value: string; error: string}, handlers: {ok: () => void; fail: () => void}) { return ${markup}; }`,
			'page.tsx': `import {peek,TaskContext,type Component} from '@exactjs/core';
			import { inputs } from './inputs.js'; import { read } from './service.server.js';
			${viewShape === 'helper' ? "import { view } from './view.js';" : ''}
			export function Workspace(this: Component<{value: string; error: string; revision: number; mode: string}>) {
				this.state.value='initial';this.state.error='';this.state.revision=0;this.state.mode='ok';
				function first(value: string, task: TaskContext=TaskContext.server()) {return Promise.resolve(read(value));}
				function second(value: string, task: TaskContext=TaskContext.server()) {return Promise.resolve(read(value+'2'));}
				const run=async(revision: number)=>{if(!revision)return;const mode=peek(()=>this.state.mode);try{this.state.value=await first(mode);this.state.value=await second(mode)}catch{this.state.error='caught'}};
				void run(this.state.revision);
				const handlers=inputs(this.state);
				return ()=> ${viewShape === 'helper' ? 'view(this.state,handlers)' : markup.replaceAll('state.', 'this.state.')};
			}
			export function Shell(this: Component<{ready: boolean}>) {
				this.state.ready=false;
				const prepare=(_task: TaskContext=TaskContext.server().blocking())=>{this.state.ready=true};
				prepare();return ()=> <main><Workspace/></main>;
			}
			export const app=<Shell/>;`
		});
		const results = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated'),
			serverComponents: true
		});
		const page = results.find((result) => result.inputFile === files['page.tsx'])!;
		const graph = createExactArtifactGraph(results, {
			packageRoot: root,
			sourceRoot: root,
			rootDir: path.join(root, 'generated')
		});
		const registry = path.join(root, 'generated/registration.ts');
		await writeFile(registry, createExactHydrationRegistrationModule(graph));
		const serverModule = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
		const registrationModule = await importArtifact(registry, path.join(root, 'registration.mjs'));
		const registration = registrationModule.exactHydrationRegistration as {
			islands: Parameters<typeof mountClientServerTest>[0]['islands'];
		};
		const contract = composeExactExecutorContract(
			[serverModule.Shell, serverModule.Workspace] as AnyComponentFunction[],
			{ endpoint: '/__exact' }
		);
		const runtime = createExactServerRuntime({ contract });
		for (const batch of [false, true]) {
			const server = await renderToHydratableString(serverModule.app as Child);
			const test = await mountClientServerTest({
				server,
				islands: registration.islands,
				hydrate: { ...registration, endpoint: '/__exact', batch },
				handle: (request) => handleExactRequest(request, runtime)
			});
			try {
				const output = test.container.querySelector('output');
				const button = test.container.querySelector<HTMLButtonElement>('#ok')!;
				expect(output?.textContent).toBe('initial:');
				for (const [selector, expected] of [
					['#ok', 'ok2:'],
					['#fail', 'ok2:caught'],
					['#ok', 'recovered2:caught']
				]) {
					test.container.querySelector<HTMLButtonElement>(selector!)!.click();
					await expect.poll(() => output?.textContent).toBe(expected);
					expect(test.container.querySelector('output')).toBe(output);
					expect(test.container.querySelector('#ok')).toBe(button);
				}
			} finally {
				test.unmount();
			}
		}
	}
);
