/** @vitest-environment jsdom */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { render, dispose } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { importArtifact } from '../test-support/import-artifact.js';

const cases = (['latest', 'parallel'] as const).flatMap((policy) =>
	(['map', 'set'] as const).flatMap((collection) =>
		[false, true].map((removal) => ({ policy, collection, removal }))
	)
);

it.each(cases)(
	'isolates $collection publication for $policy tasks with disposal=$removal',
	async ({ policy, collection, removal }) => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const directory = path.resolve(
			`.tmp/task-collection-publication/${collection}-${policy}-${removal}`
		);
		await mkdir(directory, { recursive: true });
		const edit =
			collection === 'map' ? 'this.state.map.set("x",value)' : 'this.state.set.add(value)';
		const read =
			collection === 'map' ? 'this.state.map.get("x")' : 'this.state.set.has(value)?value:0';
		const source = `import {TaskContext,type Component} from '@exactjs/core';
export const gates=new Map<number,()=>void>();export const log:string[]=[];export const signals:AbortSignal[]=[];export const completions:Promise<string>[]=[];let sequence=0;
export let retained:Component<{map:Map<string,number>;set:Set<number>;trace:string}>;
export function Probe(this:typeof retained){retained=this;this.state.map=new Map();this.state.set=new Set();this.state.trace='';
const run=async(value:number,task:TaskContext=TaskContext.client().${policy}().blocking())=>{
 signals.push(task.signal);const result=${edit};const eager=${read};
 try{await new Promise<void>(resolve=>gates.set(value,resolve));log.push('after'+value);this.state.trace=value+':'+eager+':'+(result===this.state.${collection});}
 finally{log.push('finally'+value);}
};return ()=> <section><output>{this.state.trace}</output><button onClick={()=>{const value=++sequence;completions.push(Promise.resolve(run(value)).then(()=> 'ok'+value,()=> 'cancel'+value));}}>Next</button></section>;
}`;
		const response = compiler.request({
			kind: 'compile',
			target: 'client',
			id: path.join(directory, 'probe.tsx'),
			source,
			root: process.cwd(),
			diagnostics: 'semantic'
		});
		expect(response.error).toBeUndefined();
		expect(response.diagnostics).toEqual([]);
		const file = path.join(directory, 'probe.ts');
		await writeFile(file, response.code!);
		const module = await importArtifact(file, path.join(directory, 'probe.mjs'));
		const gates = module.gates as Map<number, () => void>;
		const log = module.log as string[];
		const signals = module.signals as AbortSignal[];
		const completions = module.completions as Promise<string>[];
		const host = document.createElement('div');
		document.body.append(host);
		onTestFinished(() => {
			dispose(host, true);
			host.remove();
			for (const release of gates.values()) release();
		});
		const reports: unknown[] = [];
		render(createCompiledComponentReceipt(module.Probe as AnyComponentFunction, {}), host, {
			onErrorReport: (report) => reports.push(report)
		});
		const retained = module.retained as { state: { map: Map<string, number>; set: Set<number> } };
		const map = retained.state.map,
			set = retained.state.set;
		const button = host.querySelector('button')!,
			output = host.querySelector('output')!;
		const tick = async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			flushSync();
		};
		button.click();
		await tick();
		expect(gates.has(1)).toBe(true);
		expect(map.size).toBe(0);
		expect(set.size).toBe(0);
		if (removal) {
			dispose(host, true);
			await tick();
			gates.get(1)!();
			await tick();
			expect(await completions[0]).toBe('cancel1');
			expect(log).toEqual(['finally1']);
			expect(map.size).toBe(0);
			expect(set.size).toBe(0);
			expect(host.childNodes).toHaveLength(0);
		} else {
			button.click();
			await tick();
			expect(signals[0]!.aborted).toBe(policy === 'latest');
			gates.get(2)!();
			await tick();
			expect(output.textContent).toBe('2:2:true');
			gates.get(1)!();
			await tick();
			expect(output.textContent).toBe(policy === 'latest' ? '2:2:true' : '1:1:true');
			expect(await completions[0]).toBe(policy === 'latest' ? 'cancel1' : 'ok1');
			expect(await completions[1]).toBe('ok2');
			expect(log.filter((value) => value === 'finally1')).toHaveLength(1);
			expect(log.filter((value) => value === 'finally2')).toHaveLength(1);
			if (collection === 'map') expect(map.get('x')).toBe(policy === 'latest' ? 2 : 1);
			else expect([...set]).toEqual(policy === 'latest' ? [2] : [2, 1]);
			button.click();
			await tick();
			gates.get(3)!();
			await tick();
			expect(await completions[2]).toBe('ok3');
			expect(output.textContent).toBe('3:3:true');
			expect(host.querySelector('output')).toBe(output);
			expect(retained.state.map).toBe(map);
			expect(retained.state.set).toBe(set);
		}
		expect(reports).toEqual([]);
	}
);
