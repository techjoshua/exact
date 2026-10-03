/** @vitest-environment jsdom */
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { render, dispose } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { importArtifact } from '../test-support/import-artifact.js';

for (const form of [
	'synchronous helper',
	'asynchronous helper',
	'module synchronous helper',
	'module asynchronous helper',
	'module synchronous function',
	'module asynchronous function',
	'imported synchronous helper',
	'imported asynchronous helper',
	'external synchronous helper',
	'external asynchronous helper',
	'published synchronous helper',
	'published asynchronous helper',
	'published external synchronous helper',
	'published external asynchronous helper',
	'packaged external synchronous helper',
	'packaged external asynchronous helper',
	'packaged external CommonJS synchronous helper',
	'packaged external CommonJS asynchronous helper'
])
	for (const policy of ['latest', 'parallel'])
		for (const removal of [false, true]) {
			it(`preserves ${form} ${policy} disposal=${removal} finally and publication`, async () => {
				let compiler = new NativeCompilerProcess({
					executable: resolveNativeCompilerExecutable()
				});
				onTestFinished(() => compiler.dispose());
				const directory = path.resolve(`.tmp/task-helper-publication/${form}-${policy}-${removal}`);
				await mkdir(directory, { recursive: true });
				const helper = !form.includes('asynchronous')
					? 'const assign=(owner:Component<{count:number;trace:string}>)=>{owner.state.count=value};assign(this);'
					: 'const assign=async(owner:Component<{count:number;trace:string}>)=>{if(owner!==this)throw new Error("Replaced owner");owner.state.count=value;await new Promise<void>(resolve=>gates.set(value,resolve));owner.state.count=value;};';
				const wait = !form.includes('asynchronous')
					? 'await new Promise<void>(resolve=>gates.set(value,resolve));'
					: 'await assign(this);';
				let moduleHelper =
					!form.startsWith('synchronous') && !form.startsWith('asynchronous')
						? helper
								.replace('const assign=', 'export const assign=')
								.replace(')=>{', ',value:number)=>{')
								.replace('if(owner!==this)throw new Error("Replaced owner");', '')
								.replace('assign(this);', '')
						: '';
				if (form.endsWith('function'))
					moduleHelper = moduleHelper
						.replace('export const assign=async(', 'export async function assign(')
						.replace('export const assign=(', 'export function assign(')
						.replace('function assign(', 'function assign(this: void,')
						.replace(
							')=>{',
							'){if(arguments!==arguments||arguments.length!==2||arguments[0]!==owner)throw new Error("Helper arguments changed");'
						);
				const taskHelper =
					!form.startsWith('synchronous') && !form.startsWith('asynchronous')
						? form.includes('asynchronous')
							? ''
							: 'assign(this,value);'
						: helper;
				const taskWait =
					!form.startsWith('synchronous') &&
					!form.startsWith('asynchronous') &&
					form.includes('asynchronous')
						? 'await assign(this,value);'
						: wait;
				let source = `import {TaskContext,type Component} from '@exactjs/core';
 export const gates=new Map<number,()=>void>(); export const log:string[]=[]; export const signals:AbortSignal[]=[]; export const completions:Promise<string>[]=[];let sequence=0;
 ${moduleHelper}
 export function Probe(this:Component<{count:number;trace:string}>){this.state.count=0;this.state.trace='';
 const run=async(value:number,task:TaskContext=TaskContext.client().${policy}().blocking())=>{
 signals.push(task.signal);${taskHelper}
 try{${taskWait}log.push('after'+value);this.state.count+=1;this.state.trace=value+':'+this.state.count;}
 finally{log.push('finally'+value);}
 };
 return ()=> <section><aside>{this.state.count}</aside><output>{this.state.trace}</output><button onClick={()=>{const value=++sequence;completions.push(Promise.resolve(run(value)).then(()=> 'ok'+value,()=> 'cancel'+value));}}>Next</button></section>;
 }`;
				if (
					form.startsWith('imported') ||
					form.startsWith('external') ||
					form.startsWith('published') ||
					form.startsWith('packaged')
				) {
					const helperFile = path.join(directory, 'helper.ts');
					const helperSource = `import type {Component} from '@exactjs/core';export const gates=new Map<number,()=>void>();${moduleHelper}`;
					await writeFile(helperFile, helperSource);
					let publishedSource = helperSource;
					if (!form.includes('external')) {
						const compiledHelper = compiler.request({
							kind: 'compile',
							target: 'client',
							id: helperFile,
							source: helperSource,
							root: process.cwd(),
							diagnostics: 'semantic'
						});
						expect(compiledHelper.diagnostics, JSON.stringify(compiledHelper.diagnostics)).toEqual(
							[]
						);
						await writeFile(helperFile, compiledHelper.code!);
						publishedSource = compiledHelper.code!;
					}
					if (form.startsWith('published') || form.startsWith('packaged')) {
						const commonJs = form.includes('CommonJS');
						const javascript = commonJs ? 'helper.cjs' : 'helper.js';
						const declaration = commonJs ? 'helper.d.cts' : 'helper.d.ts';
						const publishedDirectory = form.startsWith('packaged')
							? path.join(directory, 'node_modules/@fixture/helper')
							: directory;
						await mkdir(publishedDirectory, { recursive: true });
						if (form.startsWith('packaged'))
							await writeFile(
								path.join(publishedDirectory, 'package.json'),
								JSON.stringify({
									name: '@fixture/helper',
									version: '1.0.0',
									type: 'module',
									exports: { '.': { types: './' + declaration, default: './' + javascript } }
								})
							);
						await writeFile(
							path.join(publishedDirectory, javascript),
							commonJs
								? stripTypeScriptTypes(publishedSource).replaceAll('export const ', 'const ') +
										'\nexports.assign=assign;exports.gates=gates;'
								: stripTypeScriptTypes(publishedSource)
						);
						await writeFile(
							path.join(publishedDirectory, declaration),
							`import type {Component} from '@exactjs/core'${commonJs ? ' with { "resolution-mode": "import" }' : ''};
export const gates:Map<number,()=>void>;
export function assign(owner:Component<{count:number;trace:string}>,value:number):${form.includes('asynchronous') ? 'Promise<void>' : 'void'};`
						);
						await rm(helperFile);
						// A fresh consumer must resolve declarations, without the producer's virtual source cache.
						compiler.dispose();
						compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
					}
					source = source
						.replace(
							moduleHelper,
							`import {assign,gates} from ${JSON.stringify(form.startsWith('packaged') ? '@fixture/helper' : './helper.js')};export {gates};`
						)
						.replace('export const gates=new Map<number,()=>void>();', '');
				}

				const result = compiler.request({
					kind: 'compile',
					target: 'client',
					id: path.join(directory, 'probe.tsx'),
					source,
					root: process.cwd(),
					diagnostics: 'semantic'
				});
				expect(result.diagnostics, JSON.stringify(result.diagnostics)).toEqual([]);
				const file = path.join(directory, 'probe.ts');
				await writeFile(file, result.code!);
				const module = await importArtifact(file, path.join(directory, 'probe.mjs'));
				const host = document.createElement('div');
				document.body.append(host);
				const gates = module.gates as Map<number, () => void>,
					log = module.log as string[],
					signals = module.signals as AbortSignal[],
					completions = module.completions as Promise<string>[];
				onTestFinished(() => {
					dispose(host, true);
					host.remove();
					for (const release of gates.values()) release();
				});
				const reports: unknown[] = [];
				render(createCompiledComponentReceipt(module.Probe as AnyComponentFunction, {}), host, {
					onErrorReport: (r) => reports.push(r)
				});
				const button = host.querySelector('button')!,
					output = host.querySelector('output')!;
				const tick = async () => {
					await new Promise((r) => setTimeout(r, 0));
					flushSync();
				};
				button.click();
				await tick();
				expect(gates.has(1)).toBe(true);
				expect(host.querySelector('aside')!.textContent).toBe('0');
				if (removal) {
					dispose(host, true);
					await tick();
					gates.get(1)!();
					await tick();
					expect(await completions[0]).toBe('cancel1');
					expect(log).toEqual(['finally1']);
					expect(host.childNodes.length).toBe(0);
				} else {
					button.click();
					await tick();
					expect(gates.has(2)).toBe(true);
					expect(signals[0]!.aborted).toBe(policy === 'latest');
					gates.get(2)!();
					await tick();
					expect(output.textContent).toBe('2:3');
					gates.get(1)!();
					await tick();
					expect(output.textContent).toBe(policy === 'latest' ? '2:3' : '1:2');
					expect(await completions[0]).toBe(policy === 'latest' ? 'cancel1' : 'ok1');
					expect(await completions[1]).toBe('ok2');
					expect(log.filter((v) => v === 'finally1')).toHaveLength(1);
					expect(log.filter((v) => v === 'finally2')).toHaveLength(1);
					button.click();
					await tick();
					gates.get(3)!();
					await tick();
					expect(output.textContent).toBe('3:4');
					expect(host.querySelector('output')).toBe(output);
				}
				expect(reports).toEqual([]);
			});
		}
