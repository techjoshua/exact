import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { composeExactExecutorContract } from '@exactjs/server';
import { createExactServerHandlerRegistry, renderToString } from '@exactjs/ssr';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import type { AnyComponentFunction, LogEvent } from '@exactjs/core';

/** Owns a checked-JavaScript project and releases its compiler and temporary files. */
async function checkedJavaScriptProject() {
	const parent = path.resolve('.tmp/checked-javascript-contracts');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, 'project-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				target: 'ESNext',
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				jsx: 'preserve',
				strict: true,
				allowJs: true,
				checkJs: true,
				skipLibCheck: true,
				lib: ['ESNext', 'DOM']
			},
			include: ['*.js', '*.jsx']
		})
	);
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	return {
		root,
		compile: (source: string, target: 'default' | 'client' | 'server', extension = 'jsx') =>
			compiler.request({
				kind: target === 'default' ? 'check' : 'compile',
				target,
				root,
				id: path.join(root, `work.${extension}`),
				source,
				diagnostics: 'semantic'
			})
	};
}

const cases = {
	assignment: {
		valid: 'this.state.value=Number(props.value);',
		invalid: 'this.state.value=props.value;',
		code: 'TS2322'
	},
	callback: {
		valid: "this.state.value=Number(props.callback('ok'));",
		invalid: 'this.state.value=Number(props.callback(42));',
		code: 'TS2345'
	},
	contextual: {
		valid: 'this.state.value=Number(props.consume(value=>value.toUpperCase()));',
		invalid: 'this.state.value=Number(props.consume(value=>value.toFixed()));',
		code: 'TS2551'
	},
	union: {
		valid: "if(typeof props.choice==='number')this.state.value=props.choice;",
		invalid: 'this.state.value=props.choice;',
		code: 'TS2322'
	},
	readonly: {
		valid: 'this.state.value=props.item.value;',
		invalid: 'props.item.value=2;this.state.value=props.item.value;',
		code: 'TS2540'
	},
	nullable: {
		valid: 'if(props.maybe!==null)this.state.value=Number(props.maybe);',
		invalid: 'this.state.value=Number(props.maybe.toUpperCase());',
		code: 'TS18047'
	}
};

for (const extension of ['js', 'jsx'])
	for (const target of ['default', 'client', 'server'] as const)
		for (const [name, contract] of Object.entries(cases))
			it(`preserves checked JavaScript ${name} obligations (${extension}, ${target})`, async () => {
				const { compile } = await checkedJavaScriptProject();
				const source = (body: string) => `import {TaskContext} from '@exactjs/core';
/** @this {import('@exactjs/core').Component<{value:number}>}
 * @param {{value:string,choice:string|number,maybe:string|null,item:Readonly<{value:number}>,callback:(value:string)=>string,consume:(callback:(value:string)=>string)=>string}} props
 */
export function Work(props){this.state.value=0;
 function load(task=TaskContext.client().blocking()){${body}}
 load();return()=>this.state.value;
}`;
				const valid = compile(source(contract.valid), target, extension);
				expect(valid.error).toBeUndefined();
				expect(valid.diagnostics).toEqual([]);
				expect(valid.analysis?.components).toHaveLength(1);
				expect(valid.analysis?.components[0].placement).toBe('isomorphic');
				expect(valid.analysis?.tasks[0].placement).toBe('client');
				const invalid = compile(source(contract.invalid), target, extension);
				expect(invalid.diagnostics?.some((diagnostic) => diagnostic.code === contract.code)).toBe(
					true
				);
			});

it('executes checked JavaScript SSR and a subsequent task with owned cleanup', async () => {
	const { root, compile } = await checkedJavaScriptProject();
	const result = compile(
		`import {TaskContext} from '@exactjs/core';
/** @type {string[]} */ export const cleaned=[];
/** @this {import('@exactjs/core').Component<{value:number}>}
 * @param {{value:string}} props
 */
export function Work(props){this.state.value=0;
 function load(task=TaskContext.server().blocking()){
  task.cleanup(()=>{cleaned.push(props.value);});this.state.value=Number(props.value);
 }load();return()=> <output>{this.state.value}</output>;
}`,
		'server'
	);
	expect(result.error).toBeUndefined();
	expect(result.diagnostics).toEqual([]);
	const entry = path.join(root, 'generated.ts');
	await writeFile(entry, result.code!);
	const compiled = await importArtifact(entry, path.join(root, 'generated.mjs'));
	const Work = compiled.Work as AnyComponentFunction;
	const reports: LogEvent[] = [];
	const logger = { log: (event: LogEvent) => reports.push(event) };
	const rendered = await renderToString(createCompiledComponentReceipt(Work, { value: '7' }), {
		logger
	});
	expect(rendered.html).toContain('7');
	expect(compiled.cleaned).toEqual(['7']);
	const contract = composeExactExecutorContract([Work]);
	const id = Object.keys(contract.invocations)[0];
	const registry = createExactServerHandlerRegistry({ contract });
	const next = await registry.invocations[id](
		{ type: 'invoke', id, state: { value: 7 }, payload: { dependencies: ['9'] } },
		{ contract, logger }
	);
	expect(next.state).toEqual({ value: 9 });
	expect(compiled.cleaned).toEqual(['7', '9']);
	expect(reports.filter((event) => event.level === 'warn' || event.level === 'error')).toEqual([]);
});
