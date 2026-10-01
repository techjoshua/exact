/** @vitest-environment jsdom */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { renderToString } from '@exactjs/ssr';
import { render, dispose } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
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
			const source = `import {TaskContext${example.policyAlias ? ' as Context' : ''},type Component} from '@exactjs/core';
${example.definitions ?? ''}
${example.accessor ? 'export const writes:number[]=[];let stored=0;' : ''}
export function Probe(this:Component<{count:number;values:number[];lookup:Map<string,number>;members:Set<number>;nested:{count:number;deep?:{count:number}};trace:string;${example.extraState ?? ''}}>) {
this.state.count=0;this.state.values=[];this.state.lookup=new Map();this.state.members=new Set();this.state.nested=${example.accessor ? '{get count(){return stored},set count(value:number){stored=value;writes.push(value)}}' : '{count:0,deep:{count:0}}'};this.state.trace='';
${example.seed ? `const seed=async(task:${policy}=${policy}.${target}().latest().blocking())=>{this.state.count=await Promise.resolve(5);};void seed();` : ''}
${example.setup ?? ''}
const run=async(${example.parameters ?? ''}task:${policy}=${policy}.${target}().latest().blocking())=>{${example.work}${example.holdPath && target === 'client' ? 'await new Promise<void>(resolve=>release=resolve);' : ''}};
${target === 'server' ? 'void run();' : ''}
return ()=> <section>${example.holdPath ? `<aside>{this.state.${example.holdPath}${example.holdPath === 'lookup' ? '.size' : '.count'}}</aside>` : ''}<output>{${example.collection === 'values' ? "this.state.values.join(',')" : example.collection === 'lookup' ? "Array.from(this.state.lookup.values()).join(',')" : example.collection === 'members' ? "Array.from(this.state.members).join(',')" : 'this.state.trace'}}</output><button onClick={()=>run()}>Next</button></section>;
}`;
			const file = path.join(directory, target + '.ts');
			const result = compiler.request({
				kind: 'compile',
				target,
				id: path.join(directory, target + '.tsx'),
				source,
				root: process.cwd(),
				diagnostics: 'semantic'
			});
			expect(result.error).toBeUndefined();
			await writeFile(file, result.code!);
			expect(result.diagnostics).toEqual([]);
			const module = await importArtifact(file, path.join(directory, target + '.mjs'));
			const Component = module.Probe as AnyComponentFunction;
			if (target === 'server') {
				const html = await renderToString(createCompiledComponentReceipt(Component, {}), {
					maxTaskDurationMs: 1000
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
				render(createCompiledComponentReceipt(Component, {}), host, {
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
