import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { buildDiagnosticFixture as build } from './compiler-diagnostic-build.js';

const execute = promisify(execFile);

/** Checks finite source ownership and mutation diagnostics through each host and both targets. */
export async function verifyRegistrySourceContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	contract: 'registry source ownership' | 'registry mutation ownership'
) {
	await writeFile(
		path.join(root, 'Row.tsx'),
		`export function Row(){return()=> <p>registry row</p>}`
	);
	const ordinary = `createComponentRegistry(function(){return {'quote"key':Row}})`;
	const variants =
		contract === 'registry source ownership'
			? [
					[`const Views=(${ordinary})!;const Alias=Views;`, ''],
					[
						"const Views=createComponentRegistry(({lazy:load})=>({'quote\"key':(load)(()=>import(`./Row.js`).then(module=>module[`Row`]))}));const Alias=Views;",
						''
					],
					[
						`const Views=createComponentRegistry(builder=>({'quote"key':builder.lazy(()=>import('./Row.js').then(module=>module.Row))}));const Alias=Views;`,
						''
					]
				]
			: [
					[
						`const Views=createComponentRegistry(({lazy})=>({'quote"key':lazy(()=>import('./Row.js').then(({['Row']:Chosen})=>Chosen))}));const Alias=Views;`,
						'EXACT_COMPONENT_REGISTRY'
					],
					[
						`const Views=${ordinary};const Alias=Views;(Views as Record<string,typeof Row>)['quote"key']=Row;`,
						'EXACT_COMPONENT_REGISTRY'
					],
					[
						`const Views=${ordinary};const Alias=Views;delete (Alias as Partial<Record<string,typeof Row>>)['quote"key'];`,
						'EXACT_COMPONENT_REGISTRY'
					],
					[`const Views=${ordinary};const Alias=Views;`, '']
				];
	for (const target of ['client', 'server'] as const) {
		for (const [definition, diagnostic] of variants) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import {createComponentRegistry,type KeyOf} from '@exactjs/core';import {renderToString} from '@exactjs/ssr';import {Row} from './Row.js';${definition}export function Page(props:{selection:KeyOf<typeof Views>}){const Current=(Alias[props.selection] satisfies typeof Row);return()=> <Current/>}export async function run(){return(await renderToString(<Page selection={'quote"key'}/>,{markers:false})).html}`
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
			assert.equal(failure, undefined, `${adapter}/${target} rejected finite registry ownership`);
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
				JSON.parse(result.stdout.trim()).includes('registry row'),
				`${adapter} lost the selected registry owner`
			);
		}
	}
}
