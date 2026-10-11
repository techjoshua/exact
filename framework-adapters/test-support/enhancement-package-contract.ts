import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

const execute = promisify(execFile);

/** Package catalog filtering must retain enhancement ownership supplied only by a finite spread. */
export async function verifyPackageEnhancementSpreads(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
) {
	await writeFile(
		path.join(root, 'implementation.tsx'),
		`import type {Child} from '@exactjs/core';export function Main(props:{value?:number;children?:Child}){return()=> <_>enhanced {props.children}</_>}`
	);
	await writeFile(
		path.join(root, 'facade.ts'),
		`export {Main as default} from './implementation.js' with {type:'exact-enhancement'};`
	);
	await writeFile(
		path.join(root, 'exact.config.mjs'),
		`export * as skin from './facade.js' with {type:'exact-enhancement',scope:'package'};export default {};`
	);
	for (const target of ['client', 'server'] as const) {
		await writeFile(
			path.join(root, 'entry.tsx'),
			`import {renderToString} from '@exactjs/ssr';export function Page(){const settings={'skin:value':1};return()=> <div {...settings}>ordinary</div>}export async function run(){return(await renderToString(<Page/>,{markers:false})).html}`
		);
		await buildDiagnosticFixture(adapter, root, target, false, true);
		if (target === 'client') continue;
		const output = path.join(root, 'out-server', adapter === 'webpack' ? 'entry.cjs' : 'entry.js');
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
		const html: unknown = JSON.parse(result.stdout.trim());
		assert.equal(typeof html, 'string');
		assert.ok(
			String(html).includes('enhanced'),
			`${adapter} dropped the package enhancement catalog: ${String(html)}`
		);
		assert.ok(
			String(html).includes('ordinary'),
			`${adapter} lost authored content: ${String(html)}`
		);
	}
}
