import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { buildDiagnosticFixture as build } from './compiler-diagnostic-build.js';
const execute = promisify(execFile);

/** Checks writable location proof and notification contracts in both host artifacts. */
export async function verifyFormSourceContract(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	const variants = [
		['<GenericControl<string> value:changed={this.state.value}/>', '', ''],
		['<input value:onInput={(this.state.value as string)}/>', '', ''],
		['<Control value:changed={(this.state.value satisfies string)}/>', '', ''],
		['<Control value:changed={(this.state.fields[this.state.index].value as string)}/>', '', ''],
		['<input value:onInput={(copy.value)}/>', 'const copy={...props.nested};', ''],
		['<input value:onInput={(props.nested.value as string)}/>', '', 'EXACT_FORM_BINDING'],
		['<GenericControl<number> value:changed={this.state.value}/>', '', 'EXACT_COMPONENT_BINDING']
	];
	for (const target of ['client', 'server'] as const) {
		for (const [element, setup, diagnostic] of variants) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import type {Component} from '@exactjs/core';import {renderToString} from '@exactjs/ssr';function GenericControl<T>(props:{value:T;changed:(value:T)=>void}){return()=> <button>{String(props.value)}</button>}function Control(props:{value:string;changed:(value:string)=>void}){return()=> <button>{props.value}</button>}export function Page(this:Component<{value:string;fields:{value:string}[];index:number}>,props:{nested:{value:string}}){this.state.value='initial';this.state.fields=[{value:'initial'}];this.state.index=0;${setup}return()=> ${element}}export async function run(){return(await renderToString(<Page nested={{value:'initial'}}/>,{markers:false})).html}`
			);
			let failure: unknown;
			try {
				await build(adapter, root, target, false, true);
			} catch (error) {
				failure = error;
			}
			if (diagnostic) {
				assert.ok(
					String(failure).includes(diagnostic),
					`${adapter}/${target} lost ${diagnostic}: ${String(failure)}`
				);
				continue;
			}
			assert.equal(failure, undefined, `${adapter}/${target} rejected writable location`);
			if (target !== 'server') continue;
			const output = path.join(
				root,
				'out-server',
				adapter === 'webpack' ? 'entry.cjs' : 'entry.js'
			);
			const runner = path.join(root, 'run.mjs');
			await writeFile(
				runner,
				`import * as entry from ${JSON.stringify(pathToFileURL(output).href)};console.log(JSON.stringify(await(entry.run??entry.default.run)()));`
			);
			const result = await execute(
				adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
				[runner],
				{ cwd: root }
			);
			const html = JSON.parse(result.stdout.trim());
			assert.ok(
				html.includes('value="initial"') || html.includes('>initial</button>'),
				`${adapter} lost binding output: ${String(html)}`
			);
		}
	}
}
