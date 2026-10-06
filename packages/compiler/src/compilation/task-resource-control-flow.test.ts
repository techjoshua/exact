/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(
	[
		'manual',
		'immediate resource result',
		'nonnull immediate resource result',
		'direct resource disposal',
		'direct optional resource disposal',
		'direct optional defined disposal',
		'direct throwing disposal',
		'destructured resource context',
		'context binding collision',
		'direct resource method',
		'closure resource',
		'cleanup',
		'wrapped cleanup alias',
		'own',
		'uninvoked',
		'unrelated',
		'using',
		'optional',
		'awaited',
		'awaited wrapped cleanup'
	].flatMap((release) =>
		['mount', 'hydrate'].flatMap((mode) =>
			['nonblocking', 'blocking'].map((readiness) => ({ release, mode, readiness }))
		)
	)
)(
	'retains fallback ownership across executed control flow: $release ($mode, $readiness)',
	async ({ release, mode, readiness }) => {
		const body = {
			manual: 'if(release) resource[Symbol.dispose]();',
			'direct resource disposal': '(new Resource())[Symbol.dispose]();',
			'direct optional resource disposal': '(new Resource())[Symbol.asyncDispose]?.();',
			'direct optional defined disposal': '(new Resource())[Symbol.dispose]?.();',
			'direct throwing disposal': 'try{(new Resource(true))[Symbol.dispose]();}catch{}',
			'destructured resource context': 'resource[Symbol.dispose]?.();',
			'context binding collision':
				'const __exactTaskContext=1;void __exactTaskContext;resource[Symbol.dispose]?.();',
			'direct resource method': 'void ((new Resource()) as Resource).cancel();',
			'closure resource': 'void (()=>{new Resource();})();',
			'nonnull immediate resource result': 'const selected=((()=>resource)!)();void selected;',
			'immediate resource result':
				'const selected=((()=>resource) as ()=>Resource)();void selected;',
			cleanup: 'if(release) task.cleanup(()=>resource[Symbol.dispose]());',
			'wrapped cleanup alias':
				'const close=(()=>resource[Symbol.dispose]()) as (()=>void);if(release) task.cleanup(close);',
			own: 'if(release) task.own(resource);',
			uninvoked: 'const close=()=>resource[Symbol.dispose]();void close;',
			unrelated: 'resource.cancel();',
			using: '',
			optional: 'resource[Symbol.asyncDispose]?.();',
			awaited: '',
			'awaited wrapped cleanup': ''
		}[release]!;
		const releasesPerRun =
			release.startsWith('direct resource') ||
			release.startsWith('direct optional') ||
			release === 'direct throwing disposal' ||
			release === 'closure resource'
				? 2
				: 1;
		const root = await createTestWorkspace('.exact-resource-control-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `/// <reference lib="esnext.disposable" />
import {TaskContext} from '@exactjs/core';
let releases=0;export function released(){return releases;}
export const gates=new Map<number,()=>void>();export const completions:Promise<string>[]=[];
class Resource {constructor(private fail=false){}[Symbol.asyncDispose]?:()=>Promise<void>;cancel(){}release(){this[Symbol.dispose]();}[Symbol.dispose](){if(this.fail){this.fail=false;throw new Error("first release");}releases++;}}
${release === 'awaited wrapped cleanup' ? '/** @exact cleanup=release */' : '/** @exact own */'} async function acquire(){await Promise.resolve();return new Resource();}
export function Page(){this.state.phase=0;async function run(value:number,release:boolean,${release === 'destructured resource context' || release === 'context binding collision' ? '{signal}' : 'task'}:TaskContext=TaskContext.client().latest().${readiness}()){this.state.phase=value;
${release === 'using' ? 'using' : 'const'} resource=${release === 'awaited' ? 'await acquire()' : release === 'awaited wrapped cleanup' ? 'await (acquire())' : 'new Resource()'};${body}
await new Promise<void>(resolve=>gates.set(value,resolve));}
return()=> <main>{[1,2,3,4].map(value=><button data-value={value} onClick={()=>completions.push(Promise.resolve(run(value,value%2===0)).then(()=> 'ok',()=> 'cancel'))}>{value}</button>)}</main>;}`
		});
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const host = document.createElement('div');
		const reports: unknown[] = [];
		const gates = client.gates as Map<number, () => void>;
		const completions = client.completions as Promise<string>[];
		const released = client.released as () => number;
		onTestFinished(() => {
			unmount(host);
			for (const resume of gates.values()) resume();
		});
		if (mode === 'hydrate') {
			const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
			const output = await renderToHydratableString(receipt(server.Page as never, {}));
			host.innerHTML = output.html;
			const first = host.querySelector('button');
			const view = hydrate(receipt(client.Page as never, {}), host, {
				...composeExactComponentContracts([client.Page as AnyComponentFunction], 'client'),
				resumptions: output.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r.error)
			});
			onTestFinished(() => view.dispose());
			expect(host.querySelector('button')).toBe(first);
		} else
			render(receipt(client.Page as never, {}), host, {
				onErrorReport: (r) => reports.push(r.error)
			});
		const first = host.querySelector('button');
		const start = async (value: number) => {
			host.querySelector<HTMLButtonElement>(`[data-value="${value}"]`)!.click();
			await expect.poll(() => gates.has(value)).toBe(true);
		};
		for (const value of [1, 2]) {
			await start(value);
			gates.get(value)!();
			expect(await completions[value - 1]).toBe('ok');
			expect(released()).toBe(value * releasesPerRun);
			expect(host.querySelector('button')).toBe(first);
		}
		await start(3);
		await start(4);
		expect(await completions[2]).toBe('cancel');
		unmount(host);
		expect(await completions[3]).toBe('cancel');
		expect(released()).toBe(4 * releasesPerRun);
		expect(reports).toEqual([]);
	}
);

it.each(['mount', 'hydrate'])(
	'preserves native await using disposal and cancellation settlement (%s)',
	async (mode) => {
		const root = await createTestWorkspace('.exact-native-disposal-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `/// <reference lib="esnext.disposable" />
import {TaskContext} from '@exactjs/core';
export let releases=0;export let started=0;
export const gates=new Map<number,()=>void>();export const cleanups=new Map<number,()=>void>();
export const completions:Promise<string>[]=[];
class Resource {constructor(private value:number){}async [Symbol.asyncDispose](){started++;await new Promise<void>(resolve=>cleanups.set(this.value,resolve));releases++;}}
export function Page(){async function run(value:number,task:TaskContext=TaskContext.client().latest()){
await using resource=new Resource(value);void resource;
await new Promise<void>(resolve=>gates.set(value,resolve));}
return()=> <main>{[1,2].map(value=><button data-value={value} onClick={()=>completions.push(Promise.resolve(run(value)).then(()=> 'ok',()=> 'cancel'))}>{value}</button>)}</main>;}`
		});
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const host = document.createElement('div');
		const reports: unknown[] = [];
		const gates = client.gates as Map<number, () => void>;
		const cleanups = client.cleanups as Map<number, () => void>;
		const completions = client.completions as Promise<string>[];
		onTestFinished(() => {
			unmount(host);
			for (const resume of gates.values()) resume();
			for (const resume of cleanups.values()) resume();
		});
		if (mode === 'hydrate') {
			const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
			const output = await renderToHydratableString(receipt(server.Page as never, {}));
			host.innerHTML = output.html;
			const first = host.querySelector('button');
			const view = hydrate(receipt(client.Page as never, {}), host, {
				...composeExactComponentContracts([client.Page as AnyComponentFunction], 'client'),
				resumptions: output.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r.error)
			});
			onTestFinished(() => view.dispose());
			expect(host.querySelector('button')).toBe(first);
		} else
			render(receipt(client.Page as never, {}), host, {
				onErrorReport: (r) => reports.push(r.error)
			});
		for (const value of [1, 2]) {
			host.querySelector<HTMLButtonElement>(`[data-value="${value}"]`)!.click();
			await expect.poll(() => gates.has(value)).toBe(true);
			if (value === 1) gates.get(value)!();
			else unmount(host);
			await expect.poll(() => cleanups.has(value)).toBe(true);
			let settled = false;
			void completions[value - 1]!.then(() => {
				settled = true;
			});
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(settled).toBe(false);
			expect(client.started).toBe(value);
			cleanups.get(value)!();
			await expect.poll(() => settled || Number(client.started) > value).toBe(true);
			expect(client.started).toBe(value);
			expect(await completions[value - 1]).toBe(value === 1 ? 'ok' : 'cancel');
			expect(client.releases).toBe(value);
		}
		expect(reports).toEqual([]);
	}
);

it('waits for native lexical disposal before publishing compiled server setup', async () => {
	const root = await createTestWorkspace('.exact-server-disposal-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': `/// <reference lib="esnext.disposable" />
import {TaskContext} from '@exactjs/core';
let started=0;let released=0;let finish:()=>void;export function status(){return {started,released};}export function release(){finish();}
class Resource {async [Symbol.asyncDispose](){started++;await new Promise<void>(resolve=>finish=resolve);released++;}}
export function Page(){this.state.value=0;async function initialize(task:TaskContext=TaskContext.server()){
await using resource=new Resource();void resource;this.state.value=7;}
initialize();return()=> <output>{this.state.value}</output>;}`
	});
	const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const reports: unknown[] = [];
	const rendering = renderToHydratableString(receipt(server.Page as never, {}), {
		logger: { log: (event) => reports.push(event) }
	});
	let settled = false;
	void rendering.then(() => {
		settled = true;
	});
	onTestFinished(() => {
		if ((server.status as () => { started: number })().started) (server.release as () => void)();
	});
	await expect.poll(() => (server.status as () => { started: number })().started).toBe(1);
	expect(settled).toBe(false);
	(server.release as () => void)();
	const output = await rendering;
	expect(output.html).toContain('7');
	expect((server.status as () => { released: number })().released).toBe(1);
	expect((server.status as () => { started: number })().started).toBe(1);
	expect(reports).toEqual([]);
});
