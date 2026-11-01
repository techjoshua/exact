import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import {
	buildDiagnosticFixture,
	assertDiagnosticBuildWarnings
} from './compiler-diagnostic-build.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Checks controlled selection after supplied option placement through each actual adapter.
 * The caller owns the fixture directory. This owner closes Chromium and its build sessions.
 * Optional roots select an explicitly bound isolated provider and source qualification graph.
 */
export async function verifyControlledSelectContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	qualification?: Readonly<{ packageRoot: string; sourceRoot: string }>
): Promise<void> {
	const packageRoot = qualification?.packageRoot ?? workspace;
	const sourceRoot = qualification?.sourceRoot ?? workspace;
	await mkdir(root, { recursive: true });
	await writeFile(
		path.join(root, 'package.json'),
		JSON.stringify({ name: '@fixture/controlled-select', type: 'module', private: true })
	);
	await writeFile(
		path.join(root, 'exact.config.mjs'),
		`export * as theme from "@exactjs/theme/enhancements" with {type:"exact-enhancement",scope:"package"}; export default {};`
	);
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				strict: true,
				jsx: 'preserve',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				lib: ['ES2022', 'DOM']
			},
			include: ['*.ts', '*.tsx']
		})
	);
	await writeFile(
		path.join(root, 'page.tsx'),
		await readFile(
			path.join(
				sourceRoot,
				'packages/component-composition-corpus/test-support/controlled-select/select.fixtures.tsx'
			)
		)
	);
	const entries: Record<string, string> = {};
	for (const target of ['server', 'client'] as const) {
		await writeFile(
			path.join(root, 'entry.tsx'),
			target === 'server'
				? `export {Probe,ContextProbe,ThemedDirect,ScopeOnly,Literal,Multiple} from './page.js';`
				: `
import {Probe,ContextProbe,ThemedDirect,ScopeOnly,Literal,Multiple} from './page.js';
import {createCompiledComponentInputReceipt as receipt} from '@exactjs/core/runtime/component-operations';
import {composeExactComponentContracts} from '@exactjs/core/framework/component-contracts';
import {render,unmount} from '@exactjs/dom/root';
import {hydrate} from '@exactjs/hydrate';
export function verify(outputs?:Record<string,{html:string;resumptions:unknown}>,dirty=false){
 const result:unknown[]=[];
 for(const [name,Component] of Object.entries({Probe,ContextProbe,ThemedDirect,ScopeOnly,Literal,Multiple})){
  if(dirty && name!=='Probe' && name!=='ContextProbe')continue;
  const host=document.createElement('div');document.body.append(host);const reports:unknown[]=[];
  try{
   const output=outputs?.[name];
   if(output)host.innerHTML=output.html;
   const original=host.querySelector('select');
   if(dirty&&original)original.value='light';
   const options={onErrorReport:(report:{error:unknown})=>reports.push(String(report.error))};
   if(output)hydrate(receipt(Component,{value:'dark'}),host,{...composeExactComponentContracts([Component],'client'),...options,resumptions:output.resumptions as never,onMismatch:'throw'});
   else render(receipt(Component,{value:'dark'}),host,options);
   const select=host.querySelector('select')!;
   result.push({name,value:select.value,selected:[...select.selectedOptions].map(option=>option.value),options:select.options.length,adopted:!output||select===original,reports});
  }finally{unmount(host);host.remove();}
 }
 return result;
}`
		);
		await assertDiagnosticBuildWarnings(
			adapter,
			root,
			target,
			await buildDiagnosticFixture(adapter, root, target, false, true, false, packageRoot)
		);
		const name = (await readdir(path.join(root, 'out-' + target))).find((name) =>
			/^entry\.(?:js|mjs|cjs)$/.test(name)
		);
		assert.ok(name, 'Missing controlled select artifact');
		entries[target] = './out-' + target + '/' + name;
	}
	const script = path.join(root, 'observe-ssr.mjs');
	await writeFile(
		script,
		`import {createPreparedServerComponentInputReference as receipt} from '@exactjs/core/runtime/component-operations';
import {renderToHydratableString,renderToString,renderToStream} from '@exactjs/ssr';
const loaded=await import(${JSON.stringify(entries.server)}),module=loaded.Probe?loaded:loaded.default,outputs={};
for(const name of ['Probe','ContextProbe','ThemedDirect','ScopeOnly','Literal','Multiple']){
 const value=()=>receipt(module[name],{value:'dark'});
 const hydrated=await renderToHydratableString(value());
 const plain=await renderToString(value(),{markers:false});
 let streamed='';for await(const chunk of renderToStream(value(),{markers:false}))streamed+=typeof chunk==='string'?chunk:new TextDecoder().decode(chunk);
 outputs[name]={...hydrated,plain:plain.html,streamed};
}
console.log(JSON.stringify(outputs));`
	);
	const server = await promisify(execFile)(
		adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
		[script],
		{ cwd: root }
	);
	await writeFile(path.join(root, 'ssr.stdout.log'), server.stdout);
	await writeFile(path.join(root, 'ssr.stderr.log'), server.stderr);
	const outputs = JSON.parse(server.stdout) as Record<
		string,
		{ html: string; resumptions: unknown; plain: string; streamed: string }
	>;
	const code = await readFile(path.join(root, entries.client!), 'utf8');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage(),
			errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.route('https://controlled-select.test/**', (route) =>
			route.fulfill({
				contentType: route.request().url().endsWith('entry.js') ? 'text/javascript' : 'text/html',
				body: route.request().url().endsWith('entry.js') ? code : '<!doctype html><body></body>'
			})
		);
		await page.goto('https://controlled-select.test/');
		const serverSelections = await page.evaluate(
			(outputs) =>
				Object.entries(outputs).map(([name, output]) => ({
					name,
					modes: ['html', 'plain', 'streamed'].map((mode) => {
						const host = document.createElement('div');
						host.innerHTML = output[mode as 'html'];
						return [...host.querySelectorAll('option[selected]')].map(
							(option) => (option as HTMLOptionElement).value
						);
					})
				})),
			outputs
		);
		await writeFile(
			path.join(root, 'server-selection-observation.json'),
			JSON.stringify(serverSelections, null, 2)
		);
		for (const row of serverSelections)
			for (const selected of row.modes)
				assert.deepEqual(selected, row.name === 'Multiple' ? ['light', 'dark'] : ['dark']);

		for (const mode of ['mount', 'hydrate', 'dirty-hydrate']) {
			const actual = (await page.evaluate(
				async ({ adapter, code, outputs, mode }) => {
					let module: { verify(outputs?: unknown, dirty?: boolean): unknown };
					if (adapter === 'webpack') {
						const container = { exports: {} };
						new Function('exports', 'module', code)(container.exports, container);
						module = container.exports as typeof module;
					} else
						module = await new Function(
							'return import("https://controlled-select.test/entry.js")'
						)();
					return module.verify(mode === 'mount' ? undefined : outputs, mode === 'dirty-hydrate');
				},
				{ adapter, code, outputs, mode }
			)) as Array<{
				name: string;
				value: string;
				selected: string[];
				options: number;
				adopted: boolean;
				reports: unknown[];
			}>;
			await writeFile(
				path.join(root, mode + '-observation.json'),
				JSON.stringify({ actual, errors }, null, 2)
			);
			assert.equal(actual.length, mode === 'dirty-hydrate' ? 2 : 6);
			for (const row of actual) {
				assert.equal(
					row.value,
					mode === 'dirty-hydrate' || row.name === 'Multiple' ? 'light' : 'dark'
				);
				assert.deepEqual(
					row.selected,
					row.name === 'Multiple'
						? ['light', 'dark']
						: [mode === 'dirty-hydrate' ? 'light' : 'dark']
				);
				assert.equal(row.adopted, true);
				assert.deepEqual(row.reports, []);
				assert.equal(
					row.options,
					row.name === 'Probe' || row.name === 'ContextProbe' || row.name === 'Multiple' ? 3 : 2
				);
			}
			assert.deepEqual(errors, []);
			assert.equal(await page.locator('body').evaluate((body) => body.childNodes.length), 0);
		}
	} finally {
		await browser.close();
	}
}
