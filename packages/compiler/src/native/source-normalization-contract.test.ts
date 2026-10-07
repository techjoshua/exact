import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';

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
