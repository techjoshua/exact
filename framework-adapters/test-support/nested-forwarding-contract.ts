import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Builds both projections through normal installed adapters, then checks mount and strict adoption.
 * The diagnostic owner removes the fixture. This owner closes Chromium even on a failed transition.
 */
export async function verifyNestedForwardingContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
): Promise<void> {
	const corpus = path.resolve('packages/component-composition-corpus/test-support');
	for (const name of ['nested-forwarding.fixtures.tsx', 'nested-forwarding-journey.ts'])
		await writeFile(
			path.join(root, name),
			(await readFile(path.join(corpus, name), 'utf8')).replace(
				'props.record.value',
				'(props.record satisfies {value:number}).value'
			)
		);
	const entries: Record<string, string> = {};
	for (const target of ['server', 'client'] as const) {
		await writeFile(
			path.join(root, 'entry.tsx'),
			target === 'server'
				? `export {NestedOwner} from './nested-forwarding.fixtures.js';`
				: `import {NestedOwner,nestedOwner} from './nested-forwarding.fixtures.js';
import {observeNestedForwarding} from './nested-forwarding-journey.js';
import {createCompiledComponentInputReceipt as receipt} from '@exactjs/core/runtime/component-operations';
import {composeExactComponentContracts} from '@exactjs/core/framework/component-contracts';
import {render,unmount} from '@exactjs/dom/root';
import {hydrate} from '@exactjs/hydrate';
export function verify(html?:string,resumptions?:unknown){
 const host=document.createElement('div');document.body.append(host);const reports:unknown[]=[];
 try{
  if(html!==undefined)host.innerHTML=html;
  const original=host.querySelector('output');
  const options={onErrorReport:(report:{error:unknown})=>reports.push(report.error)};
  if(html===undefined)render(receipt(NestedOwner,{}),host,options);
  else hydrate(receipt(NestedOwner,{}),host,{...composeExactComponentContracts([NestedOwner],'client'),...options,resumptions:resumptions as never,onMismatch:'throw'});
  const adopted=html===undefined||host.querySelector('output')===original;
  return {observations:observeNestedForwarding(host,nestedOwner()),adopted,reports};
 }finally{unmount(host);host.remove();}
}`
		);
		assert.deepEqual(
			await buildDiagnosticFixture(adapter, root, target, false, true, false, workspace),
			[]
		);
		const name = (await readdir(path.join(root, 'out-' + target))).find((value) =>
			/^entry\.(?:js|mjs|cjs)$/.test(value)
		);
		assert.ok(name, 'Missing nested forwarding ' + target + ' artifact');
		entries[target] = './out-' + target + '/' + name;
	}
	const runner = path.join(root, 'nested-ssr.mjs');
	await writeFile(
		runner,
		`import {createCompiledComponentInputReceipt as receipt} from '@exactjs/core/runtime/component-operations';
import {renderToHydratableString} from '@exactjs/ssr';
const loaded=await import(${JSON.stringify(entries.server)});const module=loaded.NestedOwner?loaded:loaded.default;
console.log(JSON.stringify(await renderToHydratableString(receipt(module.NestedOwner,{}))));`
	);
	const serverHost = adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath;
	const ssr = await promisify(execFile)(serverHost, [runner], { cwd: root, timeout: 30000 });
	const output = JSON.parse(ssr.stdout) as { html: string; resumptions: unknown };
	const code = await readFile(path.join(root, entries.client!), 'utf8');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.route('https://nested-forwarding.test/**', (route) =>
			route.fulfill({
				contentType: route.request().url().endsWith('entry.js') ? 'text/javascript' : 'text/html',
				body: route.request().url().endsWith('entry.js') ? code : '<!doctype html><body></body>'
			})
		);
		await page.goto('https://nested-forwarding.test/');
		for (const mode of ['mount', 'hydrate']) {
			const result = (await page.evaluate(
				async ({ code, adapter, mode, output }) => {
					let module: { verify(html?: string, resumptions?: unknown): unknown };
					if (adapter === 'webpack') {
						const container = { exports: {} };
						new Function('exports', 'module', code)(container.exports, container);
						module = container.exports as typeof module;
					} else {
						// Keep this browser import outside Vitest's server module rewriting.
						module = await new Function(
							'return import("https://nested-forwarding.test/entry.js")'
						)();
					}
					return mode === 'hydrate'
						? module.verify(output.html, output.resumptions)
						: module.verify();
				},
				{ code, adapter, mode, output }
			)) as {
				observations: {
					text: string;
					state: number;
					leafValue: unknown;
					outputIdentity: boolean;
					leafIdentity: boolean;
				}[];
				adopted: boolean;
				reports: unknown[];
			};
			assert.deepEqual(
				result.observations.map((entry) => entry.text),
				['2', '3', '11', '11', '12', '', '']
			);
			assert.deepEqual(
				result.observations.map((entry) => entry.state),
				[1, 2, 10, 10, 11, 11, 12]
			);
			assert.deepEqual(
				result.observations.slice(0, 5).map((entry) => entry.leafValue),
				[1, 2, 10, 10, 11]
			);
			assert.ok(
				result.observations.slice(0, 5).every((entry) => entry.outputIdentity && entry.leafIdentity)
			);
			assert.equal(result.adopted, true);
			assert.deepEqual(result.reports, []);
			assert.deepEqual(errors, []);
			assert.equal(await page.locator('body').evaluate((body) => body.childNodes.length), 0);
		}
	} finally {
		await browser.close();
	}
}
