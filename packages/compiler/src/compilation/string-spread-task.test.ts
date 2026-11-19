import path from 'node:path';
import { expect, it } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { readExactComponentContract } from '@exactjs/core/framework/component-contracts';
import { composeExactExecutorContract, createExactContinuationHandler } from '@exactjs/server';
import { compileFileArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createBrowserTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

it('publishes the label computed by a server task mapping a spread string', async () => {
	const root = await createBrowserTestWorkspace('.exact-string-spread-', process.cwd());
	const files = await writeTestFiles(root, {
		'Page.tsx': `import {TaskContext, type Component} from '@exactjs/core';
export type ParsedColor = Readonly<{ l: number; c: number; h: number; alpha: number }>;
function parseHex(text: string): ParsedColor {
	const value = text.slice(1);
	if (![3, 4, 6, 8].includes(value.length) || !/^[0-9a-f]+$/.test(value)) throw new Error('hex');
	const expanded = value.length < 5 ? [...value].map((x) => x + x).join('') : value;
	const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6), 16) / 255 : 1;
	return {
		l: Number.parseInt(expanded.slice(0, 2), 16) / 255,
		c: Number.parseInt(expanded.slice(2, 4), 16) / 255,
		h: Number.parseInt(expanded.slice(4, 6), 16) / 255,
		alpha
	};
}

function parseCssColor(source: string): ParsedColor {
 const text = source.trim().toLowerCase();
 if (text.startsWith('#')) return parseHex(text);
 throw new Error('syntax');
}
function select(value: string|number) {
 const parsed = typeof value === 'string' ? parseCssColor(value) : {l:value,c:0,h:0,alpha:1};
 return [parsed.l,parsed.c,parsed.h,parsed.alpha].join(',');
}
export function Page(this:Component<{label:string,input:string|number}>, props:{input:string|number}) {
 this.state.label=''; this.state.input=props.input;
 const run=(task:TaskContext=TaskContext.server())=>{this.state.label=select(this.state.input);};
 return()=> <button onClick={()=>run()}>{this.state.label}</button>;
}
`
	});
	const artifact = await compileFileArtifacts(files['Page.tsx']!, {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const client = await importArtifact(artifact.clientFile, path.join(root, 'client.mjs'));
	const server = await importArtifact(artifact.serverFile, path.join(root, 'server.mjs'));
	const [task] = readExactComponentContract(client.Page as AnyComponentFunction)!.continuations;
	expect(task!.stateReads.map((read) => read.path)).toEqual(['input']);
	expect(task!.stateWrites.map((write) => write.path)).toEqual(['label']);
	const page = server.Page as AnyComponentFunction;
	const executor = readExactComponentContract(page)!.executors.find(
		(entry) => entry.id === task!.id
	);
	const invoke = createExactContinuationHandler(task!, executor!);
	const context = {
		contract: composeExactExecutorContract([page], { endpoint: '/__exact' }),
		invocations: {}
	};
	for (const [input, alpha] of [
		['#abc', 255],
		['#aabbcc', 255],
		['#abcd', 221],
		['#aabbccdd', 221]
	] as const) {
		const label = [170, 187, 204, alpha].map((channel) => channel / 255).join(',');
		const result = await invoke(
			{ type: 'invoke', id: task!.id, state: { input }, payload: { dependencies: [] } },
			context
		);
		expect(result.value).toBeUndefined();
		expect(result.state).toEqual({ label });
	}
});
