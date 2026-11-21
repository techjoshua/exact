/** @vitest-environment jsdom */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { renderToString } from '@exactjs/ssr';
import { render, dispose } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { decodeReactiveProtocolValue } from '@exactjs/reactive/framework/protocol';
import {
	composeExactExecutorContract,
	exactResponseToFetchResponse,
	handleExactRequest
} from '@exactjs/server';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { taskStateRegressionCases as cases } from '../test-support/task-state-regression-cases.js';
for (const example of cases)
	it(`preserves '${example.name}' in direct SSR and client tasks`, async () => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const directory = path.resolve(
			'.tmp/task-state-regressions/' + example.name.replaceAll(' ', '-')
		);
		await mkdir(directory, { recursive: true });
		for (const target of example.targets ?? (['client', 'server'] as const)) {
			const policy = example.policyAlias ? 'Context' : 'TaskContext';
			const source = `${example.disposable ? '/// <reference lib="esnext.disposable" />\n' : ''}import {TaskContext${example.policyAlias ? ' as Context' : ''},type Component} from '@exactjs/core';
${example.definitions ?? ''}
${example.accessor ? 'export const writes:number[]=[];let stored=0;' : ''}
export function Probe(this:Component<{count:number;values:number[];lookup:Map<string,number>;members:Set<number>;nested:{count:number;deep?:{count:number}};trace:string;${example.extraState ?? ''}}>) {
this.state.count=0;this.state.values=[];this.state.lookup=new Map();this.state.members=new Set();this.state.nested=${example.accessor ? '{get count(){return stored},set count(value:number){stored=value;writes.push(value)}}' : '{count:0,deep:{count:0}}'};this.state.trace='';
${example.seed ? `const seed=async(task:${policy}=${policy}.${target}().latest().blocking())=>{this.state.count=await Promise.resolve(5);};void seed();` : ''}
${example.setup ?? ''}
${example.functionDeclaration ? 'async function run(' : example.functionExpression ? 'const run=async function(' : 'const run=async('}${example.parameters ?? ''}task:${policy}=${policy}.${target}().latest().blocking())${example.functionDeclaration || example.functionExpression ? '' : '=>'}{${example.work}${example.holdPath && target === 'client' ? 'await new Promise<void>(resolve=>release=resolve);' : ''}};
${target === 'server' ? 'void run();' : ''}
return ()=> <section>${example.holdPath ? `<aside>{this.state.${example.holdPath}${example.holdPath === 'lookup' ? '.size' : '.count'}}</aside>` : ''}<output>{${example.collection === 'values' ? "this.state.values.join(',')" : example.collection === 'lookup' ? "Array.from(this.state.lookup.values()).join(',')" : example.collection === 'members' ? "Array.from(this.state.members).join(',')" : (example.renderExpression ?? 'this.state.trace')}}</output>${example.setupOnly ? '' : '<button onClick={()=>run()}>Next</button>'}</section>;
}`;
			const file = path.join(directory, target + '.ts');
			const configFile = example.disposable ? path.join(directory, 'tsconfig.json') : undefined;
			if (configFile)
				await writeFile(
					configFile,
					JSON.stringify({ compilerOptions: { lib: ['ES2022', 'DOM', 'ESNext.Disposable'] } })
				);
			const result = compiler.request({
				kind: 'compile',
				target,
				id: path.join(directory, target + '.tsx'),
				source,
				root: process.cwd(),
				configFile,
				diagnostics: 'semantic'
			});
			expect(result.error).toBeUndefined();
			await writeFile(file, result.code!);
			// The cost advisory describes analysis work independently of the emitted task behavior.
			expect(
				result.diagnostics?.filter(
					(diagnostic) => diagnostic.code !== 'EXACT_ANALYSIS_COST' || diagnostic.severity !== 'warning'
				)
			).toEqual([]);
			const module = await importArtifact(file, path.join(directory, target + '.mjs'));
			const Component = module.Probe as AnyComponentFunction;
			if (target === 'server') {
				const html = await renderToString(createCompiledComponentInputReceipt(Component, {}), {
					signal: AbortSignal.timeout(1000)
				});
				expect(html.html).toContain(
					`<output>${example.accessor ? '1,2,3' : example.expected}</output>`
				);
				if (example.accessor) expect(module.writes).toEqual([1, 2, 3]);
			} else {
				const host = document.createElement('div');
				document.body.append(host);
				onTestFinished(() => {
					dispose(host, true);
					host.remove();
				});
				const reports: unknown[] = [];
				render(createCompiledComponentInputReceipt(Component, {}), host, {
					onErrorReport: (report) => reports.push(report)
				});
				if (example.seed) {
					await new Promise((resolve) => setTimeout(resolve, 0));
					flushSync();
				}
				const output = host.querySelector('output');
				const button = host.querySelector('button')!;
				for (let index = 0; index < 3; index++) {
					button.click();
					await new Promise((resolve) => setTimeout(resolve, 0));
					flushSync();
					if (example.holdPath) {
						expect(host.querySelector('aside')!.textContent).toBe(
							index === 0 ? '0' : example.holdPath === 'lookup' ? '1' : '9'
						);
						(module.release as () => void)();
						await new Promise((resolve) => setTimeout(resolve, 0));
						flushSync();
					}
					expect(host.querySelector('output')).toBe(output);
					expect(output!.textContent).toBe(
						example.accessor
							? index === 0
								? ''
								: Array.from({ length: index * 3 }, (_, value) => value + 1).join(',')
							: example.increments
								? String(6 + index)
								: example.collection === 'values'
									? Array.from({ length: index + 1 }, () => example.expected).join(',')
									: example.name === 'ordered collection reads' ||
										  example.name === 'eager Array length after pending push'
										? String(index + 1)
										: example.expected
					);
					if (example.accessor)
						expect(module.writes).toEqual(
							Array.from({ length: (index + 1) * 3 }, (_, value) => value + 1)
						);
				}
				expect(reports).toEqual([]);
				dispose(host, true);
				button.click();
				expect(host.childNodes.length).toBe(0);
			}
		}
	});
it('uses the captured prop index for server-local setup writes', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const directory = path.resolve('.tmp/task-state/server-local-index');
	await mkdir(directory, { recursive: true });
	const result = compiler.request({
		kind: 'compile',
		target: 'server',
		id: path.join(directory, 'Page.tsx'),
		root: process.cwd(),
		diagnostics: 'semantic',
		source: `import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{rows:{value:number}[]}>, props:{index:number}){
	this.state.rows=[{value:0},{value:0}];
	const write=(_task:TaskContext=TaskContext.server().blocking())=>{
		this.state.rows[props.index].value=7;
	};
	write();
	return()=> <output>{this.state.rows[0].value},{this.state.rows[1].value}</output>;
}`
	});
	expect(result.error).toBeUndefined();
	expect(result.diagnostics).toEqual([]);
	const file = path.join(directory, 'server.ts');
	await writeFile(file, result.code!);
	const module = await importArtifact(file, path.join(directory, 'server.mjs'));
	for (const [index, expected] of ['7,0', '0,7'].entries()) {
		const html = await renderToString(
			createCompiledComponentInputReceipt(module.Page as AnyComponentFunction, { index })
		);
		expect(html.html).toContain(`<output>${expected}</output>`);
	}
});
it('evaluates client task status selection once in server rendering', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const directory = path.resolve('.tmp/task-state-regressions/server-status-selection');
	await mkdir(directory, { recursive: true });
	const result = compiler.request({
		kind: 'compile',
		target: 'server',
		id: path.join(directory, 'Page.tsx'),
		root: process.cwd(),
		diagnostics: 'semantic',
		source: `import {TaskContext,taskStatus,type Component} from '@exactjs/core';export let selections=0;export function Page(this:Component<{}>){const run=(task:TaskContext=TaskContext.client().queue().key('lane'))=>{};const status=taskStatus(run,{key:(selections++,'lane')});return()=> <output>{status.pendingCount}:{selections}</output>;}`
	});
	expect(result.error).toBeUndefined();
	expect(result.diagnostics).toEqual([]);
	const file = path.join(directory, 'server.ts');
	await writeFile(file, result.code!);
	const module = await importArtifact(file, path.join(directory, 'server.mjs'));
	const html = await renderToString(
		createCompiledComponentInputReceipt(module.Page as AnyComponentFunction, {})
	);
	expect(html.html).toContain('<output>0:1</output>');
	expect(module.selections).toBe(1);
});
it('runs stateless task timers through the generated component owner', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const directory = path.resolve('.tmp/task-state-regressions/stateless-task-owner');
	await mkdir(directory, { recursive: true });
	for (const target of ['client', 'server'] as const) {
		const result = compiler.request({
			kind: 'compile',
			target,
			id: path.join(directory, target + '.tsx'),
			root: process.cwd(),
			diagnostics: 'semantic',
			source: `import{TaskContext,taskTimeout}from'@exactjs/core';export let completed=0;export function Page(){async function run(task:TaskContext=TaskContext.${target}().blocking()){await new Promise<void>(resolve=>taskTimeout(task.signal,resolve,1));completed++;}${target === 'server' ? 'run();' : ''}return()=> <button onClick={()=>run()}>Run</button>;}`
		});
		expect(result.error).toBeUndefined();
		expect(result.diagnostics).toEqual([]);
		const file = path.join(directory, target + '.ts');
		await writeFile(file, result.code!);
		const module = await importArtifact(file, path.join(directory, target + '.mjs'));
		const receipt = createCompiledComponentInputReceipt(module.Page as AnyComponentFunction, {});
		if (target === 'server') {
			await renderToString(receipt);
		} else {
			const host = document.createElement('main');
			onTestFinished(() => {
				dispose(host, true);
				host.remove();
			});
			render(receipt, host);
			host.querySelector('button')!.click();
			await new Promise((resolve) => setTimeout(resolve, 20));
			flushSync();
		}
		expect(module.completed).toBe(1);
	}
});
it('retains parameterized client task omission in server work', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const directory = path.resolve('.tmp/task-state-regressions/parameterized-task-omission');
	await mkdir(directory, { recursive: true });
	const result = compiler.request({
		kind: 'compile',
		target: 'server',
		id: path.join(directory, 'Page.tsx'),
		root: process.cwd(),
		diagnostics: 'semantic',
		source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const browser=(value:number,task:TaskContext=TaskContext.client())=>{this.state.value=value;};async function run(task:TaskContext=TaskContext.server().blocking()){await Promise.resolve();browser(100);this.state.value+=2;}run();return()=> <output>{this.state.value}</output>;}`
	});
	expect(result.error).toBeUndefined();
	expect(result.diagnostics).toEqual([]);
	const file = path.join(directory, 'server.ts');
	await writeFile(file, result.code!);
	const module = await importArtifact(file, path.join(directory, 'server.mjs'));
	const rendered = await renderToString(
		createCompiledComponentInputReceipt(module.Page as AnyComponentFunction, {})
	);
	expect(rendered.html).toContain('<output>2</output>');
});
it('preserves wrapped policy definitions through repeated blocking work', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	for (const [index, wrapper] of [
		'(WORK)',
		'(WORK) as ((task?:TaskContext)=>Promise<void>)',
		'(WORK) satisfies ((task?:TaskContext)=>Promise<void>)',
		'(WORK)!'
	].entries()) {
		const directory = path.resolve('.tmp/task-state-regressions/wrapped-policy-' + index);
		await mkdir(directory, { recursive: true });
		for (const target of ['client', 'server'] as const) {
			const work = `async(task:TaskContext=TaskContext.${target}().blocking())=>{this.state.value++;await Promise.resolve();}`;
			const result = compiler.request({
				kind: 'compile',
				target,
				id: path.join(directory, target + '.tsx'),
				root: process.cwd(),
				diagnostics: 'semantic',
				source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const run=${wrapper.replace('WORK', work)};${target === 'server' ? 'run();' : ''}return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`
			});
			expect(result.error).toBeUndefined();
			expect(result.diagnostics).toEqual([]);
			const file = path.join(directory, target + '.ts');
			await writeFile(file, result.code!);
			const module = await importArtifact(file, path.join(directory, target + '.mjs'));
			const receipt = createCompiledComponentInputReceipt(module.Page as AnyComponentFunction, {});
			if (target === 'server') {
				expect((await renderToString(receipt)).html).toContain('>1</button>');
			} else {
				const host = document.createElement('main');
				onTestFinished(() => {
					dispose(host, true);
					host.remove();
				});
				render(receipt, host);
				const button = host.querySelector('button')!;
				for (let value = 1; value <= 3; value++) {
					button.click();
					expect(button.textContent).toBe(String(value - 1));
					await new Promise((resolve) => setTimeout(resolve, 0));
					flushSync();
					expect(button.textContent).toBe(String(value));
				}
			}
		}
	}
});
it('rejects erased server collection publication before dispatch', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	for (const target of ['client', 'server'] as const) {
		const result = await compiler.request({
			kind: 'compile',
			id: path.resolve('.tmp/erased-server-collection.tsx'),
			target,
			diagnostics: 'semantic',
			source: `import{TaskContext,type Component}from'@exactjs/core';export function Probe(this:Component<{lookup:any}>){this.state.lookup=new Map();const run=(task:TaskContext=TaskContext.server().blocking())=>{this.state.lookup.set('result',1);};return()=> <button onClick={()=>run()}/>;}`
		});
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'EXACT2001',
					message: expect.stringContaining('statically known Array, Map or Set')
				})
			])
		);
		expect(result.code).toBe('');
	}
});

it.each(['reader', 'writer'] as const)(
	'preserves activation captures around an imported pending helper (%s)',
	async (helper) => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const directory = path.resolve('.tmp/task-state-regressions/imported-pending-' + helper);
		await mkdir(directory, { recursive: true });
		const effect = helper === 'writer' ? "left.value = 'after'" : 'void left.value';
		await writeFile(
			path.join(directory, 'helper.ts'),
			`export function apply(left: { value: string }, enabled: boolean) {
				if (enabled) ${effect};
			}`
		);
		const current = helper === 'writer' ? 'after' : 'before';
		for (const target of ['client', 'server'] as const) {
			const result = compiler.request({
				kind: 'compile',
				target,
				id: path.join(directory, target + '.tsx'),
				root: process.cwd(),
				diagnostics: 'semantic',
				source: `import { TaskContext, type Component } from '@exactjs/core';
import { apply } from './helper.js';
export function Page(this: Component<{ left: { value: string; sibling: string }; result: string }>) {
	this.state.left = { value: 'before', sibling: 'take' };
	this.state.result = '';
	async function run(snapshot = this.state.left.value, task: TaskContext = TaskContext.${target}().blocking()) {
		const entry = this.state.left.value;
	apply(this.state.left, this.state.left.sibling === 'take');
		this.state.result = snapshot + ':' + entry + ':' + this.state.left.value + ':' + this.state.left.sibling;
	}
	run();
	return () => <output>{this.state.result}</output>;
}`
			});
			expect(result.error).toBeUndefined();
			expect(result.diagnostics).toEqual([]);
			const file = path.join(directory, target + '.ts');
			await writeFile(file, result.code!);
			const module = await importArtifact(file, path.join(directory, target + '.mjs'));
			const Page = module.Page as AnyComponentFunction;
			if (target === 'server') {
				const contract = composeExactExecutorContract([Page]);
				const [invocation] = Object.values(contract.invocations);
				const paths = helper === 'writer' ? ['left.value', 'result'] : ['result'];
				expect(invocation.stateWrites.map((write) => write.path).sort()).toEqual(paths);
				expect(invocation.stateWrites.every((write) => write.confidence === 'exact')).toBe(true);
				for (const sibling of ['take', 'skip']) {
					const left = { value: 'before', sibling };
					const responsePromise = handleExactRequest(
						{
							method: 'POST',
							body: JSON.stringify({
								type: 'invoke',
								id: invocation.id,
								state: { left },
								payload: { dependencies: [left.value, left, sibling, left.value] }
							})
						},
						{ contract, logger: { log() {} } }
					);
					// The browser's committed object can change while the server runs the
					// already serialized activation against its request-local state.
					left.sibling = 'committed-later';
					const response = await responsePromise;
					expect(response.status).toBe(200);
					const value = sibling === 'take' ? current : 'before';
					const write = helper === 'writer' && sibling === 'take' ? { left: { value } } : {};
					const output = decodeReactiveProtocolValue(
						await exactResponseToFetchResponse(response).json()
					);
					expect((output as { state: unknown }).state).toEqual({
						result: `before:${value}:${value}:${sibling}`,
						...write
					});
				}
			} else {
				const host = document.createElement('div');
				onTestFinished(() => dispose(host, true));
				const reports: unknown[] = [];
				render(createCompiledComponentInputReceipt(Page, {}), host, {
					onErrorReport: (report) => reports.push(report)
				});
				await new Promise((resolve) => setTimeout(resolve, 0));
				flushSync();
				expect(reports).toEqual([]);
				expect(host.querySelector('output')?.textContent).toBe(`before:${current}:${current}:take`);
			}
		}
	}
);
