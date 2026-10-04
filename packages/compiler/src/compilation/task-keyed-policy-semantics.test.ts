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
		outDir: path.join(root, 'generated')
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
