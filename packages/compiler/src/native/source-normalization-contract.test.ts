import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

for (const [name, setup, render, rejected] of [
	['compound-cycle', 'this.state.value += props.input;', '() => <p/>', true],
	['increment-cycle', 'if (props.input) ++this.state.value;', '() => <p/>', true],
	[
		'parent-child-cycle',
		'this.state.object = await Promise.resolve({value:this.state.object.value});',
		'() => <p/>',
		true
	],
	['escaped-local', 'const value = await Promise.resolve(1);', '() => <p>{value}</p>', true],
	[
		'render-shadow',
		'const value = await Promise.resolve(1); this.state.value = value;',
		'() => <p>{[2].map(input=>{const value=input;return value})}</p>',
		false
	],
	[
		'callback-shadow',
		'const value = await Promise.resolve(1); this.state.value = value;',
		'() => <p>{[2].map(value=>value)}</p>',
		false
	],
	[
		'inferred-chain',
		'this.state.value = props.input; this.state.next=this.state.value+1;',
		'() => <p>{this.state.next}</p>',
		false
	],
	[
		'snapshot',
		'this.state.value = peek(()=>this.state.value)+props.input;',
		'() => <p>{this.state.value}</p>',
		false
	]
] as const)
	it(`preserves ${name} through checking and both targets`, () => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const source = `import {Component,peek} from '@exactjs/core';export function Probe(this:Component<{value:number;next:number;object:{value:number}}>,props:{input:number}){${setup}return ${render};}`;
		for (const target of ['default', 'client', 'server'] as const) {
			const request = () =>
				compiler.request({
					kind: target === 'default' ? 'check' : 'compile',
					id: path.resolve('.tmp/normalization-' + name + '.tsx'),
					source,
					root: process.cwd(),
					target,
					diagnostics: 'semantic'
				});
			if (rejected) expect(request).toThrow(/reactive.*cycle|escapes into the render function/);
			else {
				const result = request();
				expect(result.error).toBeUndefined();
				expect(result.diagnostics).toEqual([]);
				if (target !== 'default') expect(result.code).toBeTruthy();
			}
		}
	});

// Prepared dependencies retain inferred browser-task ownership when compiled before their importer.
it('preserves prepared imported computation placement through semantic checking', async () => {
	const root = await createTestWorkspace('.exact-prepared-task-origin-', process.cwd());
	const configFile = path.join(root, 'tsconfig.json');
	const id = path.join(root, 'Widget.tsx');
	const page = path.join(root, 'Page.tsx');
	const source = `import {type Component} from '@exactjs/core';export function Widget(this:Component<{width:number}>){this.state.width=window.innerWidth;return()=> <button onClick={()=>this.state.width++}>°😀</button>;}`;
	const suffix = `\nimport type { TaskContext } from '@exactjs/core';`;
	const pageSource = `import {Widget} from './Widget.js';export function Page(){return()=> <main><Widget/></main>;}`;
	await writeTestFiles(root, {
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				target: 'ESNext',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				jsx: 'preserve',
				strict: true
			}
		}),
		'Widget.tsx': source,
		'Page.tsx': pageSource
	});
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	compiler.request({
		kind: 'synchronize',
		root,
		configFile,
		sources: [
			{ id, source: source + suffix, packageEnhancementBoundary: source.length },
			{ id: page, source: pageSource }
		]
	});
	const widget = compiler.request({
		kind: 'compile',
		root,
		configFile,
		id,
		source: source + suffix,
		packageEnhancementBoundary: source.length,
		target: 'client',
		diagnostics: 'semantic'
	});
	expect(widget.diagnostics).toEqual([]);
	expect(widget.counters?.affectedSourceCount).toBe(0);
	const result = compiler.request({
		kind: 'compile',
		root,
		configFile,
		id: page,
		source: pageSource,
		target: 'server',
		diagnostics: 'semantic'
	});
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain('__exactBoundary');
});
