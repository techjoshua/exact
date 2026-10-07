import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect } from 'vitest';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const execute = promisify(execFile);

/** Verifies scoped setup and callback calculations, plus cycle rejection, through paired builds. */
export async function verifySourceNormalizationContract(adapter: 'vite' | 'webpack' | 'bun') {
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/source-normalization-adapter-'));
	try {
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({ name: 'source-normalization', private: true, type: 'module' })
		);
		await writeFile(path.join(root, 'exact.config.mjs'), 'export default {};');
		const entry = path.join(root, 'entry.tsx');
		await writeFile(
			path.join(root, 'BrowserData.tsx'),
			`import {type Component} from '@exactjs/core';export function BrowserData(this:Component<{width:number}>){this.state.width=window.innerWidth;return()=> <button id="browser-data" onClick={()=>this.state.width++}>{this.state.width}</button>;}`
		);
		await writeFile(
			entry,
			`import {BrowserData} from './BrowserData.js';import {peek,TaskContext,type Component} from '@exactjs/core';import {renderToString} from '@exactjs/ssr';
export function Probe(this:Component<{input:number;output:number}>){this.state.input=1;this.state.output=this.state.input+1;const offset=this.state.input;return()=> <output>{this.state.output} / {[2].map(input=>{const value=input+offset;return value;})}</output>;}
export async function AsyncProbe(this:Component<{value:number}>){const value=await Promise.resolve(99);this.state.value=value;return()=> <button onClick={()=>this.state.value++}>{this.state.value} / {[2].map(value=>value)}</button>;}
export function SnapshotProbe(this:Component<{input:number;output:number}>){this.state.input=1;this.state.output=0;this.state.output=peek(()=>this.state.output)+this.state.input;return()=> <output onClick={()=>this.state.input++}>{this.state.output}</output>;}
export function StartupProbe(this:Component<{input:number;output:number}>){this.state.input=1;this.state.output=0;function run(_task:TaskContext=TaskContext.client()){this.state.output=this.state.input+1;}run();return()=> <output id="startup">{this.state.output}</output>;}
export function NamedSnapshotProbe(this:Component<{input:number;snapshot:number;output:number}>){this.state.input=1;this.state.snapshot=1;this.state.output=0;const value=this.state.snapshot;const callback=()=>value;function read(){return peek(callback)}this.state.output=read()+this.state.input;return()=> <output id="named-snapshot">{this.state.output}</output>;}
export function Root(){return()=> <main><Probe/><AsyncProbe/><SnapshotProbe/><StartupProbe/><BrowserData/><NamedSnapshotProbe/></main>;}
export async function run(){return (await renderToString(<Root/>,{markers:false})).html;}`
		);
		for (const target of ['client', 'server'] as const) {
			await buildDiagnosticFixture(adapter, root, target, false, true);
			if (target === 'client') continue;
			const file = path.join(
				root,
				`out-${target}`,
				adapter === 'webpack' ? 'entry.cjs' : 'entry.js'
			);
			const runner = path.join(root, 'run.mjs');
			await writeFile(
				runner,
				`import * as entry from ${JSON.stringify(pathToFileURL(file).href)};console.log(JSON.stringify(await (entry.run??entry.default.run)()));`
			);
			const result = await execute(
				adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
				[runner],
				{ cwd: root }
			);
			const html: string = JSON.parse(result.stdout.trim());
			expect(html).toContain('<output>2 / 3</output>');
			expect(html).toMatch(/<output[^>]*id="named-snapshot"[^>]*>2<\/output>/);
			expect(html).toMatch(/<button[^>]*>99 \/ 2<\/button>/);
			expect(html).toMatch(/<output[^>]*>1<\/output>/);
			expect(html).toMatch(/<output[^>]*id="startup"[^>]*>0<\/output>/);
			expect(html.match(/data-exact-client-boundary=/g)?.length).toBeGreaterThanOrEqual(2);
			expect(html).not.toContain('id="browser-data"');
		}
		for (const setup of [
			'this.state.value += props.input;',
			'this.state.object = await Promise.resolve({value:this.state.object.value});'
		]) {
			await writeFile(
				entry,
				`import {peek,TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{value:number;object:{value:number}}>,props:{input:number}){${setup}return()=> <p/>;}`
			);
			for (const target of ['client', 'server'] as const)
				await expect(buildDiagnosticFixture(adapter, root, target)).rejects.toThrow(
					/reactive.*cycle/
				);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
