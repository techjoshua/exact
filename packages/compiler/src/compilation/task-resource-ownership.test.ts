/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished, vi } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(
	['boolean', 'options', 'external'].flatMap((options) =>
		['direct', 'shared'].flatMap((lane) =>
			['mount', 'hydrate'].map((mode) => ({ options, mode, lane }))
		)
	)
)(
	'preserves listener options and generation lifetime: $options ($mode, $lane)',
	async ({ options, mode, lane }) => {
		const root = await createTestWorkspace('.exact-resource-', process.cwd());
		const option =
			options === 'boolean'
				? 'true'
				: options === 'external'
					? '{capture:true,passive:true,signal:external.signal}'
					: '{capture:true,passive:true}';
		const files = await writeTestFiles(root, {
			'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';
 export const target=new EventTarget();export const external=new AbortController();export const gates=new Map<number,()=>void>();export const signals=new Map<number,AbortSignal>();export const completions:Promise<string>[]=[];
 export function Page(this:Component<{events:number;value:number}>){this.state.events=0;this.state.value=0;
 async function run(value:number,task:TaskContext=TaskContext.client().latest()){
 signals.set(value,task.signal);target.addEventListener('probe',()=>{this.state.events++;},${option});
 await new Promise<void>(resolve=>gates.set(value,resolve));this.state.value=value;
 }
 ${lane === 'shared' ? 'const actions={run};' : ''}
 return()=> <main><button data-one onClick={()=>completions.push(Promise.resolve(${lane === 'shared' ? 'actions.run' : 'run'}(1)).then(()=> 'ok',()=> 'cancel'))}>One</button><button data-two onClick={()=>completions.push(Promise.resolve(${lane === 'shared' ? 'actions.run' : 'run'}(2)).then(()=> 'ok',()=> 'cancel'))}>Two</button><button data-three onClick={()=>completions.push(Promise.resolve(${lane === 'shared' ? 'actions.run' : 'run'}(3)).then(()=> 'ok',()=> 'cancel'))}>Three</button><output>{this.state.events}:{this.state.value}</output></main>;}`
		});
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const target = client.target as EventTarget,
			external = client.external as AbortController;
		const gates = client.gates as Map<number, () => void>,
			signals = client.signals as Map<number, AbortSignal>,
			completions = client.completions as Promise<string>[];
		const listener = vi.spyOn(target, 'addEventListener');
		const host = document.createElement('div');
		const reports: unknown[] = [];
		const errors = { onErrorReport: (r: { error: unknown }) => reports.push(r.error) };
		onTestFinished(() => {
			unmount(host);
			for (const release of gates.values()) release();
			listener.mockRestore();
		});
		if (mode === 'hydrate') {
			const output = await renderToHydratableString(receipt(server.Page as never, {}));
			host.innerHTML = output.html;
			const original = host.querySelector('output');
			const view = hydrate(receipt(client.Page as never, {}), host, {
				...composeExactComponentContracts([client.Page as AnyComponentFunction], 'client'),
				...errors,
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
			onTestFinished(() => view.dispose());
			expect(host.querySelector('output')).toBe(original);
		} else render(receipt(client.Page as never, {}), host, errors);
		const output = host.querySelector('output')!;
		const start = async (name: string, value: number) => {
			host.querySelector<HTMLButtonElement>(`[data-${name}]`)!.click();
			await expect.poll(() => gates.has(value)).toBe(true);
		};
		await start('one', 1);
		const first = listener.mock.calls[0]![2] as AddEventListenerOptions;
		expect(first.capture).toBe(true);
		expect(first.signal?.aborted).toBe(false);
		if (options !== 'boolean') expect(first.passive).toBe(true);
		target.dispatchEvent(new Event('probe'));
		flushSync();
		expect(output.textContent).toBe('1:0');
		await start('two', 2);
		expect(signals.get(1)!.aborted).toBe(true);
		expect(first.signal?.aborted).toBe(true);
		target.dispatchEvent(new Event('probe'));
		flushSync();
		expect(output.textContent).toBe('2:0');
		if (options === 'external') {
			external.abort('author');
			target.dispatchEvent(new Event('probe'));
			flushSync();
			expect(output.textContent).toBe('2:0');
			expect(signals.get(2)!.aborted).toBe(false);
		}
		gates.get(2)!();
		await expect
			.poll(() => {
				flushSync();
				return output.textContent;
			})
			.toBe('2:2');
		expect(await completions[1]).toBe('ok');
		gates.get(1)!();
		expect(await completions[0]).toBe('cancel');
		target.dispatchEvent(new Event('probe'));
		flushSync();
		expect(output.textContent).toBe('2:2');
		await start('three', 3);
		expect(host.querySelector('output')).toBe(output);
		unmount(host);
		expect(signals.get(3)!.aborted).toBe(true);
		gates.get(3)!();
		expect(await completions[2]).toBe('cancel');
		target.dispatchEvent(new Event('probe'));
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	}
);

it.each(
	['dispose', '[Symbol.dispose]', '[Symbol.asyncDispose]']
		.flatMap((method) => ['auto', 'manual'].map((mode) => ({ method, mode })))
		.concat([
			{ method: '[Symbol.dispose]', mode: 'context-inline' },
			{ method: '[Symbol.asyncDispose]', mode: 'context-alias' }
		])
)('releases a native helper class once: $method ($mode)', async ({ method, mode }) => {
	const root = await createTestWorkspace('.exact-native-disposal-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': `/// <reference lib="esnext.disposable" />
import {TaskContext} from '@exactjs/core';let releases=0,same=true;export function released(){return releases;}export function identity(){return same;}
class Resource {${method}(){releases++;return Promise.resolve();}}
export function Page(){async function run(task:TaskContext=TaskContext.client()){${mode === 'context-inline' ? 'const resource=task.own(new Resource());same=resource.constructor===Resource;' : mode === 'context-alias' ? 'const resource=new Resource();const owned=task.own(resource);same=owned===resource&&owned.constructor===Resource;' : `const resource=new Resource();${mode === 'manual' ? `await resource${method.startsWith('[') ? method : "['dispose']"}();` : 'void resource;'}`} }
return()=> <button onClick={()=>run()}>Run</button>;}`
	});
	const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const host = document.createElement('div'),
		errors: unknown[] = [];
	onTestFinished(() => {
		unmount(host);
	});
	render(receipt(client.Page as never, {}), host, { onErrorReport: (r) => errors.push(r.error) });
	const button = host.querySelector('button')!;
	const released = client.released as () => number;
	expect(released()).toBe(0);
	for (const count of [1, 2]) {
		button.click();
		await vi.waitFor(() => expect(released()).toBe(count));
		expect(host.querySelector('button')).toBe(button);
		expect((client.identity as () => boolean)()).toBe(true);
	}
	expect(errors).toEqual([]);
});

it.each(['direct', 'registered'])(
	'keeps native timer cancellation local and preserves callback publication: %s',
	async (mode) => {
		const root = await createTestWorkspace('.exact-native-timers-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';
let observed=0,release!:()=>void;export function fired(){return observed;}export function resume(){release();}
export function Page(this:Component<{count:number}>){this.state.count=0;
async function run(value:number,task:TaskContext=TaskContext.client().blocking()){
const timer=setTimeout(()=>{this.state.count=value;observed=value;},0);task.cleanup(()=>clearTimeout(timer));
const retired=setTimeout(()=>{this.state.count=99;},10000);${mode === 'direct' ? 'clearTimeout(retired);' : 'task.cleanup(()=>clearTimeout(retired));'}
await new Promise<void>(resolve=>{release=resolve;});}
return()=> <main><button data-one onClick={()=>run(1)}>One</button><button data-two onClick={()=>run(2)}>Two</button><output>{this.state.count}</output></main>;}`
		});
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const host = document.createElement('div'),
			errors: unknown[] = [];
		const timers = vi.spyOn(globalThis, 'setTimeout'),
			clears = vi.spyOn(globalThis, 'clearTimeout');
		onTestFinished(() => {
			unmount(host);
			clears.mockRestore();
			timers.mockRestore();
		});
		render(receipt(client.Page as never, {}), host, { onErrorReport: (r) => errors.push(r.error) });
		const output = host.querySelector('output')!;
		for (const [selector, value] of [
			['one', 1],
			['two', 2]
		] as const) {
			(host.querySelector(`[data-${selector}]`) as HTMLButtonElement).click();
			await vi.waitFor(() => expect((client.fired as () => number)()).toBe(value));
			expect(output.textContent).toBe(String(value - 1));
			(client.resume as () => void)();
			await vi.waitFor(() => expect(output.textContent).toBe(String(value)));
			expect(host.querySelector('output')).toBe(output);
			const indexes = timers.mock.calls.flatMap((args, index) =>
				args[1] === 10000 ? [index] : []
			);
			expect(indexes).toHaveLength(value);
			for (const index of indexes)
				expect(clears).toHaveBeenCalledWith(timers.mock.results[index]!.value);
		}
		expect(errors).toEqual([]);
	}
);
