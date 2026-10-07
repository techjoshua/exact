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
import { createTestWorkspace } from '../test-support/workspace.js';

it.each([
	'leading',
	'nested',
	'direct',
	'object',
	'helper',
	'default-present',
	'default-absent',
	'rest',
	'shadow'
])(
	'preserves state receiver identity with %s setup selection in emitted artifacts',
	async (shape) => {
		const parent = path.resolve('.tmp/destructuring-hole-regressions');
		await mkdir(parent, { recursive: true });
		const directory = await createTestWorkspace('case-', parent);
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		for (const target of ['client', 'server'] as const) {
			const nested = shape === 'nested';
			const source = `import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{rows:${nested ? '{value:number}[][]' : '{value:number}[]'}}>){
 this.state.rows=${nested ? '[[{value:0}],[{value:1},{value:2}]]' : shape === 'default-absent' ? '[{value:1}]' : '[{value:1},{value:2}]'};
 ${shape.startsWith('default-') ? 'const [,selected={value:2}]=this.state.rows;' : shape === 'rest' ? 'const [, ...selectedRows]=this.state.rows;const selected=selectedRows[0];' : shape === 'direct' ? 'const selected=this.state.rows[1];' : shape === 'object' ? 'const {1:selected}=this.state.rows;' : `const ${nested ? '[,[, selected]]' : '[, selected]'}=this.state.rows;`}
 ${shape === 'helper' ? 'function mutate(){selected.value++;}' : ''}
 function update(task:TaskContext=TaskContext.${target}().blocking()){${shape === 'shadow' ? '{const selected={value:9};selected.value++;}selected.value++;' : shape === 'helper' ? 'mutate();' : 'selected.value++;'}}
 ${target === 'server' ? 'update();' : ''}
 return()=> <section><output>{selected.value}</output><button onClick={()=>update()}>next</button></section>;
}`;
			const file = path.join(directory, `${target}.tsx`);
			const result = compiler.request({
				kind: 'compile',
				target,
				id: file,
				source,
				root: process.cwd(),
				diagnostics: 'semantic'
			});
			expect(result.error).toBeUndefined();
			if ((shape.startsWith('default-') && target === 'server') || shape === 'rest') {
				expect(result.diagnostics?.some((diagnostic) => diagnostic.code === 'EXACT2001')).toBe(
					true
				);
				continue;
			}
			expect(result.diagnostics).toEqual([]);
			await writeFile(file, result.code!);
			const module = await importArtifact(file, path.join(directory, `${target}.mjs`));
			const Page = module.Page as AnyComponentFunction;
			if (target === 'server') {
				const result = await renderToString(createCompiledComponentReceipt(Page, {}), {
					markers: false
				});
				expect(result.html).toContain('<output>3</output>');
			} else {
				const host = document.createElement('div');
				onTestFinished(() => {
					dispose(host, true);
				});
				render(createCompiledComponentReceipt(Page, {}), host);
				flushSync();
				const output = host.querySelector('output')!;
				expect(output.textContent).toBe('2');
				host.querySelector('button')!.click();
				await new Promise((resolve) => setTimeout(resolve, 0));
				flushSync();
				expect(host.querySelector('output')).toBe(output);
				// A fallback object is local storage. Only a selected state receiver publishes updates.
				expect(output.textContent).toBe(shape === 'default-absent' ? '2' : '3');
			}
		}
	}
);
