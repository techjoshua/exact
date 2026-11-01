import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
	buildDiagnosticFixture,
	assertDiagnosticBuildWarnings
} from './compiler-diagnostic-build.js';

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

		// Real public bootstrap calls retain package operation contracts under the same
		// host selection that keeps application-local callback identities above.
		await writeFile(
			path.join(root, 'entry.tsx'),
			`import {render,unmount} from '@exactjs/dom';
import {TaskContext,type Component} from '@exactjs/core';
function Page(this:Component<{label:string}>){this.state.label='ready';const update=(_task:TaskContext=TaskContext.latest())=>{this.state.label='updated';};return()=> <button onClick={()=>update()}>{this.state.label}</button>;}
const root=document.getElementById('app');if(!root)throw new Error('Missing root');render(<Page/>,root);const host=root;
export function release(){unmount(host);return host.childNodes.length;}`
		);
		const warnings = await buildDiagnosticFixture(
			adapter,
			root,
			'client',
			false,
			true,
			false,
			fileURLToPath(new URL('../../', import.meta.url))
		);
		await assertDiagnosticBuildWarnings(adapter, root, 'client', warnings);
		const entry = (await readdir(path.join(root, 'out-client'))).find((file) =>
			/^entry\.(?:js|mjs|cjs)$/.test(file)
		);
		assert.ok(entry, 'Missing public client entry');
		const code = await readFile(path.join(root, 'out-client', entry), 'utf8'),
			browser = await chromium.launch();
		try {
			const page = await browser.newPage(),
				errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await page.route('https://public-entry.test/**', (route) =>
				route.fulfill(
					route.request().url().endsWith('/entry.js')
						? { contentType: 'text/javascript', body: code }
						: { contentType: 'text/html', body: '<div id="app"></div>' }
				)
			);
			await page.goto('https://public-entry.test/');
			await page.evaluate(
				async ({ adapter, code }) => {
					if (adapter === 'webpack') {
						const module = { exports: {} };
						new Function('exports', 'module', code)(module.exports, module);
						Object.assign(globalThis, { publicEntry: module.exports });
					} else
						Object.assign(globalThis, {
							publicEntry: await new Function(
								'return import("https://public-entry.test/entry.js")'
							)()
						});
				},
				{ adapter, code }
			);
			const initial = await page.locator('button').textContent();
			await page.locator('button').click();
			await page.waitForFunction(() => document.querySelector('button')?.textContent === 'updated');
			const remaining = await page.evaluate(() => {
				const module = Reflect.get(globalThis, 'publicEntry') as { release(): number };
				return module.release();
			});
			await writeFile(
				path.join(root, 'public-entry-observation.json'),
				JSON.stringify({ initial, remaining, errors })
			);
			assert.equal(initial, 'ready');
			assert.equal(remaining, 0);
			assert.deepEqual(errors, []);
		} finally {
			await browser.close();
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
