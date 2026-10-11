/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
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
	['declaration', 'arrow', 'expression'].flatMap((shape) =>
		['mount', 'hydrate'].map((mode) => ({ shape, mode }))
	)
)('partitions latest task ownership by authored key: $shape ($mode)', async ({ shape, mode }) => {
	const root = await createTestWorkspace('.exact-keyed-task-', process.cwd());
	const body = `(key:string,value:number,task:TaskContext=TaskContext.client().latest().key(key).deferred().blocking()){
   signals.set(value,task.signal);task.cleanup(()=>cleaned.push(value));
   await new Promise<void>(resolve=>gates.set(value,resolve));
   this.state.values.set(key,value);
  }`;
	const definition =
		shape === 'declaration'
			? `async function run${body}`
			: shape === 'expression'
				? `const run=async function${body};`
				: `const run=async ${body.replace('){', ')=>{')};`;
	const files = await writeTestFiles(root, {
		'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';
export const gates=new Map<number,()=>void>();export const signals=new Map<number,AbortSignal>();export const cleaned:number[]=[];export const completions:Promise<string>[]=[];
export function Page(this:Component<{values:Map<string,number>}>){this.state.values=new Map();${definition}
return()=> <main><button data-a1 onClick={()=>completions.push(Promise.resolve(run('a',1)).then(()=> 'ok',()=> 'cancel'))}>A1</button><button data-b2 onClick={()=>completions.push(Promise.resolve(run('b',2)).then(()=> 'ok',()=> 'cancel'))}>B2</button><button data-a3 onClick={()=>completions.push(Promise.resolve(run('a',3)).then(()=> 'ok',()=> 'cancel'))}>A3</button><button data-b4 onClick={()=>completions.push(Promise.resolve(run('b',4)).then(()=> 'ok',()=> 'cancel'))}>B4</button><output>{this.state.values.get('a')??0}:{this.state.values.get('b')??0}</output></main>;}`
	});
	const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated'),
		instrumentInspection: shape === 'expression'
	});
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const gates = client.gates as Map<number, () => void>,
		signals = client.signals as Map<number, AbortSignal>,
		cleaned = client.cleaned as number[],
		completions = client.completions as Promise<string>[];
	const host = document.createElement('div');
	const reports: unknown[] = [];
	const options = { onErrorReport: (r: { error: unknown }) => reports.push(r.error) };
	onTestFinished(() => {
		unmount(host);
		for (const release of gates.values()) release();
	});
	if (mode === 'hydrate') {
		const output = await renderToHydratableString(receipt(server.Page as never, {}));
		host.innerHTML = output.html;
		const original = host.querySelector('output');
		const hydration = hydrate(receipt(client.Page as never, {}), host, {
			...composeExactComponentContracts([client.Page as AnyComponentFunction], 'client'),
			...options,
			resumptions: output.resumptions,
			onMismatch: 'throw'
		});
		onTestFinished(() => hydration.dispose());
		expect(host.querySelector('output')).toBe(original);
	} else render(receipt(client.Page as never, {}), host, options);
	const output = host.querySelector('output')!;
	for (const action of ['a1', 'b2', 'a3']) {
		host.querySelector<HTMLButtonElement>(`[data-${action}]`)!.click();
		await expect.poll(() => gates.has(Number(action[1]))).toBe(true);
	}
	expect(signals.get(1)!.aborted).toBe(true);
	expect(signals.get(2)!.aborted).toBe(false);
	expect(signals.get(3)!.aborted).toBe(false);
	gates.get(3)!();
	await expect
		.poll(() => {
			flushSync();
			return output.textContent;
		})
		.toBe('3:0');
	gates.get(1)!();
	expect(await completions[0]).toBe('cancel');
	expect(output.textContent).toBe('3:0');
	gates.get(2)!();
	await expect
		.poll(() => {
			flushSync();
			return output.textContent;
		})
		.toBe('3:2');
	expect(await completions[1]).toBe('ok');
	expect(await completions[2]).toBe('ok');
	expect(host.querySelector('output')).toBe(output);
	host.querySelector<HTMLButtonElement>('[data-b4]')!.click();
	await expect.poll(() => gates.has(4)).toBe(true);
	unmount(host);
	gates.get(4)!();
	expect(await completions[3]).toBe('cancel');
	expect(signals.get(4)!.aborted).toBe(true);
	expect([...cleaned].sort()).toEqual([1, 2, 3, 4]);
	expect(host.childNodes).toHaveLength(0);
	expect(reports).toEqual([]);
});

it.each(
	[
		'effect',
		'result',
		'reused-result',
		'aliased-result',
		'object-destructured-result',
		'array-destructured-result',
		'member-result',
		'indexed-result',
		'default-result',
		'default-reused-result',
		'default-required-reused-result'
	].flatMap((shape) => ['mount', 'hydrate'].map((mode) => ({ shape, mode })))
)(
	'preserves inspected keyed setup activation across replacement and disposal: $shape ($mode)',
	async ({ shape, mode }) => {
		const root = await createTestWorkspace('.exact-keyed-setup-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';
export const gates=new Map<number,()=>void>();export const signals=new Map<number,AbortSignal>();export const cleaned:number[]=[];
export const captures:number[]=[];function captureKey(value:number){captures.push(value);return 'setup';}
export function Page(this:Component<{input:number;revision:number;result:number}>){this.state.input=1;this.state.revision=0;this.state.result=0;
async function run(${shape.startsWith('default-') ? (shape.includes('required') ? 'offset:number=0,revision:number,' : 'revision:number,') : ''}value:number${shape.startsWith('default-') ? (shape.includes('required') ? '=this.state.input+offset' : '=this.state.input') : ''}${shape.startsWith('default-') ? ',key:string=captureKey(value)' : ''},task:TaskContext=TaskContext.client().latest().key(${shape.startsWith('default-') ? 'key' : "'setup'"})){signals.set(value,task.signal);task.cleanup(()=>cleaned.push(value));await new Promise<void>(resolve=>gates.set(value,resolve));${shape === 'effect' ? 'this.state.result=value;' : 'return value;'}}
${shape === 'object-destructured-result' ? 'const {run:activate}={run};' : shape === 'array-destructured-result' ? 'const [activate]=[run];' : shape === 'aliased-result' ? 'const activate=run;' : shape === 'member-result' || shape === 'indexed-result' ? 'const actions={run};' : ''}
${shape === 'effect' ? '' : 'this.state.result='}${shape === 'aliased-result' || shape.includes('destructured') ? 'activate' : shape === 'member-result' ? 'actions.run' : shape === 'indexed-result' ? "actions['run']" : 'run'}(${shape.startsWith('default-') ? (shape.includes('required') ? 'undefined,this.state.revision' : 'this.state.revision') : 'this.state.input'});
return()=> <main><button data-next onClick={()=>{this.state.input++;this.state.revision++;}}>Next</button>${shape.startsWith('default-') ? '<button data-capture-only onClick={()=>this.state.input=this.state.input===1?2:1}>Change captured input</button>' : ''}${shape.includes('reused-result') ? (shape.includes('required') ? '<button data-direct onClick={()=>run(undefined,99)}>Direct</button>' : '<button data-direct onClick={()=>run(99)}>Direct</button>') : ''}<output>{this.state.result}</output></main>;}`
		});
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated'),
			instrumentInspection: true
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const gates = client.gates as Map<number, () => void>;
		const signals = client.signals as Map<number, AbortSignal>;
		const cleaned = client.cleaned as number[];
		const captures = client.captures as number[];
		const host = document.createElement('div');
		const reports: unknown[] = [];
		const options = { onErrorReport: (report: { error: unknown }) => reports.push(report.error) };
		onTestFinished(() => {
			unmount(host);
			for (const release of gates.values()) release();
		});
		if (mode === 'hydrate') {
			const rendered = await renderToHydratableString(receipt(server.Page as never, {}));
			host.innerHTML = rendered.html;
			const adopted = host.querySelector('output');
			const hydration = hydrate(receipt(client.Page as never, {}), host, {
				...composeExactComponentContracts([client.Page as AnyComponentFunction], 'client'),
				...options,
				resumptions: rendered.resumptions,
				onMismatch: 'throw'
			});
			onTestFinished(() => hydration.dispose());
			expect(host.querySelector('output')).toBe(adopted);
		} else render(receipt(client.Page as never, {}), host, options);
		await expect.poll(() => gates.has(1)).toBe(true);
		if (shape.startsWith('default-')) expect(captures).toEqual([1]);
		const output = host.querySelector('output')!;
		if (shape.startsWith('default-')) {
			const captureOnly = host.querySelector<HTMLButtonElement>('[data-capture-only]')!;
			captureOnly.click();
			flushSync();
			await Promise.resolve();
			expect(gates.has(2)).toBe(false);
			expect(signals.get(1)!.aborted).toBe(false);
			captureOnly.click();
			flushSync();
		}
		host.querySelector<HTMLButtonElement>('[data-next]')!.click();
		await expect.poll(() => gates.has(2)).toBe(true);
		if (shape.startsWith('default-')) expect(captures).toEqual([1, 2]);
		expect(signals.get(1)!.aborted).toBe(true);
		expect(signals.get(2)!.aborted).toBe(false);
		gates.get(1)!();
		await Promise.resolve();
		flushSync();
		expect(output.textContent).toBe('0');
		gates.get(2)!();
		await expect
			.poll(() => {
				flushSync();
				return output.textContent;
			})
			.toBe('2');
		expect(host.querySelector('output')).toBe(output);
		host.querySelector<HTMLButtonElement>('[data-next]')!.click();
		await expect.poll(() => gates.has(3)).toBe(true);
		unmount(host);
		expect(signals.get(3)!.aborted).toBe(true);
		gates.get(3)!();
		await Promise.resolve();
		flushSync();
		await expect.poll(() => [...cleaned].sort()).toEqual([1, 2, 3]);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	}
);
