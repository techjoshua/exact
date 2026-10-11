import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Verifies lexical renderer and capability identity through each supported build adapter. */
export async function verifyHostImportIdentityContract(adapter: 'vite' | 'webpack' | 'bun') {
	const parent = path.resolve('.tmp/host-import-identity-adapters');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, adapter + '-'));
	try {
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/host-import-identity', type: 'module', private: true })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						jsx: 'preserve',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						strict: true
					},
					include: ['entry.tsx']
				})
			)
		]);
		for (const target of ['client', 'server'] as const) {
			const moduleName = target === 'client' ? '@exactjs/dom' : '@exactjs/ssr';
			const renderer = target === 'client' ? 'render' : 'renderToString';
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import {${renderer}} from '${moduleName}';
import * as api from '${moduleName}';
import {unsafeHtml} from '@exactjs/core';
function Page(){return ()=> <p>page</p>;}
export function direct(${renderer}:(value:unknown)=>string){return ${renderer}(<Page/>);}
export function namespace(api:{${renderer}(value:unknown):string}){return api.${renderer}(<Page/>);}
export function ordinary(unsafeHtml:(value:string)=>string){return unsafeHtml('safe');}`
			);
			await buildDiagnosticFixture(adapter, root, target, false, true);
			const output = path.join(root, 'out-' + target);
			const files = await readdir(output);
			const entry = files.find((file) => /^entry\.(?:js|mjs|cjs)$/.test(file));
			assert.ok(entry, `${adapter}/${target} produced no executable entry`);
			const runner = path.join(root, 'verify-' + target + '.mjs');
			await writeFile(
				runner,
				`import assert from 'node:assert/strict';
const imported=await import(${JSON.stringify('./out-' + target + '/' + entry)});
const fixture=imported.direct?imported:imported.default;
const receipts=[];const callback=value=>(receipts.push(value),'ordinary');
assert.equal(fixture.direct(callback),'ordinary');
assert.equal(fixture.namespace({${renderer}:callback}),'ordinary');
assert.equal(receipts.length,2);assert.ok(receipts.every(Boolean));
assert.equal(fixture.ordinary(value=>'local:'+value),'local:safe');`
			);
			await promisify(execFile)(process.execPath, [runner], { cwd: root });
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
