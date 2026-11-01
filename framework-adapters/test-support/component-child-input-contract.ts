import { verifyControlledSelectContract } from './controlled-select-contract.js';
import { verifyTaskCallbackOwnerContract } from './task-callback-owner-contract.js';
import { verifyListIslandLexicalContract } from './list-island-lexical-contract.js';
import { assertComponentChildInputSsr } from './component-child-input-ssr-assertions.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import {
	buildDiagnosticFixture,
	assertDiagnosticBuildWarnings
} from './compiler-diagnostic-build.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Checks component-root fallback inputs and actual opaque selection through both real targets.
 * Owns Chromium and records raw transitions before assertions. The diagnostic caller owns the fixture.
 * The optional roots qualify an isolated physical provider graph without changing adapter options.
 */
export async function verifyComponentChildInputContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	qualification?: Readonly<{ packageRoot: string; sourceRoot: string }>
): Promise<void> {
	const packageRoot = qualification?.packageRoot ?? workspace;
	const sourceRoot = qualification?.sourceRoot ?? workspace;
	await writeFile(
		path.join(root, 'page.tsx'),
		await readFile(
			path.join(
				sourceRoot,
				'packages/component-composition-corpus/test-support/component-child-input.fixtures.tsx'
			)
		)
	);
	const entries: Record<string, string> = {};
	for (const target of ['server', 'client'] as const) {
		await writeFile(
			path.join(root, 'entry.tsx'),
			target === 'server'
				? `export {ChildInputOwner,childInputLifetime,ChildInputAccessor,ChildInputLeaf} from './page.js';`
				: `import {ChildInputOwner,childInputOwner,childInputLifetime} from './page.js';
import {createCompiledComponentInputReceipt as receipt} from '@exactjs/core/runtime/component-operations';
import {composeExactComponentContracts} from '@exactjs/core/framework/component-contracts';
import {reactive,flushSync} from '@exactjs/reactive';
import {currentEffectScope} from '@exactjs/reactive/framework/runtime';
import {render,unmount} from '@exactjs/dom/root';
import {findElementOwner} from '@exactjs/dom/testing';
import {hydrate} from '@exactjs/hydrate';
export function verify(html?:string,resumptions?:unknown){
 const host=document.createElement('div');document.body.append(host);const reports:unknown[]=[];
 const value=reactive({label:'one'}),scopes:ReturnType<typeof currentEffectScope>[]=[],observations:unknown[]=[];
 let failure:unknown,adopted=false,readerParent=false,owner:ReturnType<typeof childInputOwner>|undefined;
 const before={...childInputLifetime};
 const probe={get value(){scopes.push(currentEffectScope());return value.label;}};
 try{
  if(html!==undefined)host.innerHTML=html;
  const original=host.querySelector('i');
  const options={onErrorReport:(report:{error:unknown})=>reports.push(String(report.error))};
  if(html===undefined)render(receipt(ChildInputOwner,{probe}),host,options);
  else hydrate(receipt(ChildInputOwner,{probe}),host,{...composeExactComponentContracts([ChildInputOwner],'client'),...options,resumptions:resumptions as never,onMismatch:'throw'});
  adopted=html===undefined||host.querySelector('i')===original;
  owner=childInputOwner();const button=host.querySelector('button'),leaf=host.querySelector('i'),leafOwner=leaf&&findElementOwner(leaf);
  readerParent=!!leafOwner&&leafOwner.parent===findElementOwner(host.querySelector('aside')!);
  const observe=(step:string)=>observations.push({step,text:host.textContent,span:!!host.querySelector('span'),leaf:host.querySelector('i')?.textContent,reads:scopes.length,sameButton:host.querySelector('button')===button,sameLeaf:host.querySelector('i')===leaf,sameLeafOwner:!!leaf&&findElementOwner(leaf)===leafOwner});
  observe('initial');owner.state.show=false;flushSync();observe('hidden');value.label='two';flushSync();observe('member');owner.state.show=true;flushSync();observe('shown');
 }catch(error){failure={name:(error as Error).name,message:String(error)};}
 finally{unmount(host);host.remove();}
 const accepted={observations,adopted,readerParent,reports,failure,lifetime:{created:childInputLifetime.created-before.created,disposed:childInputLifetime.disposed-before.disposed},readerScopesInactive:scopes.every(scope=>!!scope&&!scope.active),ownerInactive:!!owner&&!owner.scope.active};
 value.label='disposed';flushSync();return {...accepted,readsAfterDisposal:scopes.length};
}`
		);
		const warnings = await buildDiagnosticFixture(
			adapter,
			root,
			target,
			false,
			true,
			false,
			packageRoot
		);
		await writeFile(
			path.join(root, `${target}-child-input-warnings.json`),
			JSON.stringify(warnings)
		);
		await assertDiagnosticBuildWarnings(adapter, root, target, warnings);
		const file = (await readdir(path.join(root, 'out-' + target))).find((name) =>
			/^entry\.(?:js|mjs|cjs)$/.test(name)
		);
		assert.ok(file, 'Missing ' + target + ' child input artifact');
		entries[target] = './out-' + target + '/' + file;
	}
	await writeFile(
		path.join(root, 'child-input-ssr-observer.mjs'),
		await readFile(
			path.join(
				sourceRoot,
				'packages/component-composition-corpus/test-support/component-child-input-ssr.mjs'
			)
		)
	);
	const runner = path.join(root, 'child-input-ssr.mjs');
	await writeFile(
		runner,
		`import {createPreparedServerComponentInputReference as receipt} from '@exactjs/core/runtime/component-operations';
import {renderToHydratableString,renderToString} from '@exactjs/ssr';
import {createCompiledFragmentReceipt as fragment} from '@exactjs/core/runtime/component-operations';
import {observeComponentChildInputSsr} from './child-input-ssr-observer.mjs';
const loaded=await import(${JSON.stringify(entries.server)});const module=loaded.ChildInputOwner?loaded:loaded.default;
let reads=0;const output=await renderToHydratableString(receipt(module.ChildInputOwner,{probe:{get value(){reads++;return 'one';}}}));
const lifetime={...module.childInputLifetime};
const accessor=await observeComponentChildInputSsr({receipt,fragment,renderToString,Accessor:module.ChildInputAccessor,Leaf:module.ChildInputLeaf});
console.log(JSON.stringify({output,reads,lifetime,accessor}));`
	);
	const server = await promisify(execFile)(
		adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
		[runner],
		{ cwd: root, timeout: 30000 }
	);
	await writeFile(path.join(root, 'child-input-ssr.stdout.log'), server.stdout);
	await writeFile(path.join(root, 'child-input-ssr.stderr.log'), server.stderr);
	const result = JSON.parse(server.stdout) as {
		output: { html: string; resumptions: unknown };
		reads: number;
		lifetime: { created: number; disposed: number };
		accessor: Parameters<typeof assertComponentChildInputSsr>[0];
	};
	await writeFile(path.join(root, 'child-input-ssr-observation.json'), JSON.stringify(result));
	assertComponentChildInputSsr(result.accessor);
	assert.match(result.output.html, /<i[^>]*>one<\/i>/);
	assert.ok(result.reads >= 1);
	assert.deepEqual(result.lifetime, { created: 1, disposed: 1 });
	const code = await readFile(path.join(root, entries.client!), 'utf8'),
		browser = await chromium.launch();
	try {
		const page = await browser.newPage(),
			errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.route('https://child-input.test/**', (route) =>
			route.fulfill({
				contentType: route.request().url().endsWith('entry.js') ? 'text/javascript' : 'text/html',
				body: route.request().url().endsWith('entry.js') ? code : '<!doctype html><body></body>'
			})
		);
		await page.goto('https://child-input.test/');
		for (const mode of ['mount', 'hydrate']) {
			const actual = (await page.evaluate(
				async ({ code, adapter, mode, output }) => {
					let module: { verify(html?: string, resumptions?: unknown): unknown };
					if (adapter === 'webpack') {
						const container = { exports: {} };
						new Function('exports', 'module', code)(container.exports, container);
						module = container.exports as typeof module;
					} else
						module = await new Function('return import("https://child-input.test/entry.js")')();
					return mode === 'hydrate'
						? module.verify(output.html, output.resumptions)
						: module.verify();
				},
				{ code, adapter, mode, output: result.output }
			)) as {
				observations: {
					leaf: string;
					span: boolean;
					reads: number;
					sameButton: boolean;
					sameLeaf: boolean;
					sameLeafOwner: boolean;
				}[];
				adopted: boolean;
				readerParent: boolean;
				reports: unknown[];
				failure?: unknown;
				lifetime: { created: number; disposed: number };
				readerScopesInactive: boolean;
				ownerInactive: boolean;
				readsAfterDisposal: number;
			};
			await writeFile(
				path.join(root, `child-input-${mode}-observation.json`),
				JSON.stringify({ actual, errors }, null, 2)
			);
			assert.equal(actual.failure, undefined);
			assert.deepEqual(actual.reports, []);
			assert.deepEqual(errors, []);
			assert.deepEqual(
				actual.observations.map((row) => row.leaf),
				['one', 'one', 'two', 'two']
			);
			assert.deepEqual(
				actual.observations.map((row) => row.span),
				[true, false, false, true]
			);
			assert.ok(
				actual.observations.every((row) => row.sameButton && row.sameLeaf && row.sameLeafOwner)
			);
			assert.equal(actual.observations[0]!.reads, 1);
			assert.equal(actual.readsAfterDisposal, actual.observations.at(-1)!.reads);
			assert.equal(actual.adopted, true);
			assert.equal(actual.readerParent, true);
			assert.equal(actual.readerScopesInactive, true);
			assert.equal(actual.ownerInactive, true);
			assert.deepEqual(actual.lifetime, { created: 1, disposed: 1 });
			assert.equal(await page.locator('body').evaluate((body) => body.childNodes.length), 0);
		}
	} finally {
		await browser.close();
	}
	await verifyListIslandLexicalContract(adapter, path.join(root, 'list-island-lexical'));
	await verifyControlledSelectContract(
		adapter,
		path.join(root, 'controlled-select'),
		qualification
	);
	await verifyTaskCallbackOwnerContract(adapter, path.join(root, 'task-callback-owner'));
}
