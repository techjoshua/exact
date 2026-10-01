/** @vitest-environment jsdom */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { expect, it, onTestFinished } from 'vitest';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import type { AnyComponentFunction } from '@exactjs/core';
import { render, dispose } from '@exactjs/dom';
import { findElementOwner } from '@exactjs/dom/testing';
import { flushSync } from '@exactjs/reactive';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(['success', 'replace', 'dispose'] as const)(
	'publishes source-removed zero-argument class helpers with private and collection state (%s)',
	async (scenario) => {
		const directory = path.resolve('.tmp/task-published-class-helpers/' + scenario);
		await mkdir(directory, { recursive: true });
		const producer = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => producer.dispose());
		const helper = producer.request({
			kind: 'compile',
			target: 'client',
			root: process.cwd(),
			diagnostics: 'semantic',
			id: path.join(directory, 'producer.ts'),
			source:
				'export class Counter extends Map<string,number>{#count=0;get count(){return this.#count;}increment(){this.#count++;this.set("x",this.#count);return this.#count;}}'
		});
		expect(helper.diagnostics).toEqual([]);
		await writeFile(path.join(directory, 'helper.js'), stripTypeScriptTypes(helper.code!));
		await writeFile(
			path.join(directory, 'helper.d.ts'),
			'export class Counter extends Map<string,number>{readonly count:number;increment():number;}'
		);
		producer.dispose();
		const consumer = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => consumer.dispose());
		const component = consumer.request({
			kind: 'compile',
			target: 'client',
			root: process.cwd(),
			diagnostics: 'semantic',
			id: path.join(directory, 'probe.tsx'),
			source: `import {TaskContext,type Component} from '@exactjs/core';import {Counter} from './helper.js';
export let release:(()=>void)|undefined;
export function Probe(this:Component<{counter:Counter;trace:string}>){this.state.counter=new Counter();this.state.trace='';
const run=async(task:TaskContext=TaskContext.client().latest().blocking())=>{const value=this.state.counter.increment();this.state.trace=value+':'+this.state.counter.count+':'+this.state.counter.get('x');await new Promise<void>(resolve=>release=resolve);};
return ()=> <section><aside>{this.state.counter.count}</aside><output>{this.state.trace}</output><button onClick={()=>run()}>Next</button></section>;}`
		});
		expect(component.diagnostics).toEqual([]);
		const file = path.join(directory, 'probe.ts');
		await writeFile(file, component.code!);
		const module = await importArtifact(file, path.join(directory, 'probe.mjs'));
		const host = document.createElement('div');
		document.body.append(host);
		onTestFinished(() => {
			dispose(host, true);
			host.remove();
		});
		const reports: unknown[] = [];
		render(createCompiledComponentReceipt(module.Probe as AnyComponentFunction, {}), host, {
			onErrorReport: (report) => reports.push(report)
		});
		const output = host.querySelector('output')!;
		const instance = findElementOwner(host.querySelector('section')!)!;
		const counter = instance.state.counter as {
			count: number;
			get(key: string): number | undefined;
		};
		for (let value = 1; value <= 3; value++) {
			host.querySelector('button')!.click();
			await new Promise((resolve) => setTimeout(resolve, 0));
			flushSync();
			expect(reports).toEqual([]);
			expect(counter.count).toBe(value - 1);
			expect(counter.get('x')).toBe(value === 1 ? undefined : value - 1);
			expect(host.querySelector('aside')!.textContent).toBe(String(value - 1));
			if (value === 1 && scenario === 'dispose') {
				dispose(host, true);
				(module.release as () => void)();
				await new Promise((resolve) => setTimeout(resolve, 0));
				flushSync();
				expect(counter.count).toBe(0);
				expect(counter.get('x')).toBeUndefined();
				expect(host.childNodes.length).toBe(0);
				expect(reports).toEqual([]);
				return;
			}
			if (value === 1 && scenario === 'replace') {
				const staleRelease = module.release as () => void;
				host.querySelector('button')!.click();
				await new Promise((resolve) => setTimeout(resolve, 0));
				staleRelease();
				await new Promise((resolve) => setTimeout(resolve, 0));
				flushSync();
				expect(counter.count).toBe(0);
				expect(counter.get('x')).toBeUndefined();
			}
			(module.release as () => void)();
			await new Promise((resolve) => setTimeout(resolve, 0));
			flushSync();
			expect(host.querySelector('aside')!.textContent).toBe(String(value));
			expect(output.textContent).toBe(`${value}:${value}:${value}`);
			expect(host.querySelector('output')).toBe(output);
		}
		expect(reports).toEqual([]);
	}
);
