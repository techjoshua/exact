import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Verifies setup state aliases and aliased DOM placement through each adapter's own build path. */
export async function verifyCompilerStateAliasContract(adapter: 'vite' | 'webpack' | 'bun') {
	const parent = path.resolve('.tmp/compiler-state-alias-adapters');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, adapter + '-'));
	try {
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/compiler-state-alias', type: 'module', private: true })
			),
			writeFile(
				path.join(root, 'exact.config.mjs'),
				`export * as theme from '@exactjs/theme/enhancements' with {type:'exact-enhancement',scope:'package'};export default {};`
			),
			writeFile(
				path.join(root, 'Browser.tsx'),
				`import {type Component} from '@exactjs/core';
export let executions=0;
function readWidth(){executions++;return window.innerWidth;}
export function Browser(this:Component<{width:number}>){this.state.width=readWidth();return()=> <p>{this.state.width}</p>;}`
			),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						target: 'ESNext',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						jsx: 'preserve',
						strict: true
					},
					include: ['*.tsx']
				})
			)
		]);
		for (const target of ['client', 'server'] as const) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import {TaskContext,type Component} from '@exactjs/core';
import {unmount as teardown} from '@exactjs/dom';import {renderToString} from '@exactjs/ssr';
import {Browser} from './Browser.js';export {executions} from './Browser.js';
export let domExecutions=0;
function DOMBrowser(){domExecutions++;teardown(null as unknown as Element);return()=> <p>browser</p>}
export function Page(this:Component<{rows:{value:number}[][]}>){
 this.state.rows=[[{value:0}],[{value:1},{value:2}]];const [,[,selected]]=this.state.rows;
 function mutate(){selected.value++;}
 function update(task:TaskContext=TaskContext.${target}().blocking()){mutate();}
 ${target === 'server' ? 'update();' : ''}
 return()=> <main><output>{selected.value}</output><Browser/><DOMBrowser/><button onClick={()=>update()}>next</button></main>;
}
export async function verify(){return renderToString(<Page/>,{markers:false})}`
			);
			await buildDiagnosticFixture(adapter, root, target, false, true);
			if (target === 'client') continue;
			const files = await readdir(path.join(root, 'out-server'));
			const entry = files.find((file) => /^entry\.(?:js|mjs|cjs)$/.test(file));
			assert.ok(entry, `${adapter} produced no server entry`);
			const runner = path.join(root, 'verify.mjs');
			await writeFile(
				runner,
				`import assert from 'node:assert/strict';
const imported=await import(${JSON.stringify('./out-server/' + entry)});
const fixture=imported.verify?imported:imported.default;const result=await fixture.verify();
assert.ok(result.html.includes('<output>3</output>'),result.html);assert.equal(fixture.executions,0);assert.equal(fixture.domExecutions,0);`
			);
			await promisify(execFile)(process.execPath, [runner], { cwd: root });
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
