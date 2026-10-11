import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { buildDiagnosticFixture as build } from './compiler-diagnostic-build.js';

const execute = promisify(execFile);

/** Verifies list lowering and eager render diagnostics through both artifacts of each host. */
export async function verifyCollectionSourceContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
) {
	const variants = [
		['props.rows.map(({id,label})=><li key={id}>{label}</li>)', ''],
		['props.rows.map(row=>{const key=row.id;return <li key={key}>{row.label}</li>})', ''],
		["props.rows['map']((row=><li key={row.id}>{row.label}</li>))", ''],
		['(props.rows.map)(({id,label})=><li>{label}</li>)', ''],
		['props.rows.map(({id,label="fallback"}={id:"empty",label:""})=><li>{label}</li>)', ''],
		[
			"props.rows['map'](row=>{this.state.count++;return <li key={row.id}>{row.label}</li>})",
			'EXACT_RENDER'
		]
	];
	for (const target of ['client', 'server'] as const) {
		for (const [expression, diagnostic] of variants) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import {renderToString} from '@exactjs/ssr';interface Row{/** @exact key */ id:string;label:string}export function Page(props:{rows:Row[]}){this.state.count=0;return()=> <ul>{${expression}}</ul>}export async function run(){return(await renderToString(<Page rows={[{id:'a',label:'A'},{id:'b',label:'B'}]}/>,{markers:false})).html}`
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
			assert.equal(failure, undefined, `${adapter}/${target} rejected collection ownership`);
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
			assert.ok(
				JSON.parse(result.stdout.trim()) === '<ul><li>A</li><li>B</li></ul>',
				`${adapter} lost keyed collection output`
			);
		}
	}
}
