import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '@exactjs/compiler';
import { islandLexicalSources } from '../../packages/compiler/src/test-support/island-lexical-sources.js';
import {
	buildDiagnosticFixture,
	assertDiagnosticBuildWarnings
} from './compiler-diagnostic-build.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Executes shared island lexical witnesses through both real adapter targets and Chromium.
 * The caller owns the fixture root. This owner settles builds and closes its browser on failure.
 */
export async function verifyListIslandLexicalContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
): Promise<void> {
	await mkdir(root, { recursive: true });
	await writeFile(
		path.join(root, 'package.json'),
		'{"name":"@fixture/list-island-lexical","type":"module","private":true}'
	);
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				strict: true,
				jsx: 'preserve',
				target: 'ES2022',
				module: 'NodeNext',
				moduleResolution: 'NodeNext'
			},
			include: ['*.tsx']
		})
	);
	const names = [
		'Nested',
		'FunctionCallback',
		'LocalAlias',
		'FindingShape',
		'RecursiveLocalRuntime',
		'MutualLocal',
		'GenericDefaultDeeper',
		'QueryFunction',
		'UnusedPropsAlias',
		'GuardedUnionChildren',
		'InferredCallbackCapture'
	];
	for (const [name, source] of islandLexicalSources)
		if (names.includes(name)) await writeFile(path.join(root, name + '.tsx'), source);
	await writeFile(
		path.join(root, 'Leaf.tsx'),
		'export function Leaf(props:{text:string;active:boolean;onEnter:()=>void}){return()=> <li onMouseEnter={props.onEnter}>{props.text}{props.active?" active":""}</li>;}'
	);
	const generated = path.join(root, 'generated');
	const artifacts = await compileProjectArtifacts(
		names.map((name) => path.join(root, name + '.tsx')),
		{ rootDir: root, outDir: generated, serverComponents: true, generatedValidation: 'semantic' }
	);
	for (const name of names) {
		const owned = artifacts.filter(
			(artifact) =>
				artifact.inputFile === path.join(root, name + '.tsx') ||
				artifact.inputFile === path.join(root, 'Leaf.tsx')
		);
		const graph = createExactArtifactGraph(owned, {
			packageRoot: root,
			sourceRoot: root,
			rootDir: generated
		});
		await writeFile(
			path.join(generated, 'registration-' + name + '.ts'),
			createExactHydrationRegistrationModule(graph)
		);
	}

	const entries: Record<string, string> = {};
	for (const target of ['server', 'client'] as const) {
		const imports = names
			.map((name) => `import {List as ${name}} from './generated/${name}.exact.${target}.js';`)
			.join('\n');
		await writeFile(
			path.join(root, 'entry.tsx'),
			target === 'server'
				? imports +
						`
import {createPreparedServerComponentInputReference as receipt} from '@exactjs/core/runtime/component-operations';
import {renderToHydratableString} from '@exactjs/ssr';
export async function outputs(){const results:Record<string,unknown>={},items=[{id:'a',label:'Alpha'},{id:'b',label:'Beta'}];
for(const [name,List]of Object.entries({${names.join(',')}})){const input=name==='Nested'?{groups:[{id:'first',items:[items[0]]},{id:'second',items:[items[1]]}]}:name==='FindingShape'?{findings:items.map(item=>({id:item.id,message:item.label,tone:'notice',tag:'source',detail:'Detail',pointsAt:item.label+' location'}))}:(name==='GenericDefaultDeeper'||name==='InferredCallbackCapture')?{items:items.map((item,index)=>({...item,box:{value:0,next:{value:index+2,next:{value:index+3}}}}))}:name==='GuardedUnionChildren'?{items,kind:'b'}:{items};results[name]=await renderToHydratableString(receipt(List,input));}return results;}`
				: imports +
						'\n' +
						names
							.map(
								(name) =>
									`import {exactHydrationRegistration as Registration${name}} from './generated/registration-${name}.js';`
							)
							.join('\n') +
						`
import {createCompiledComponentInputReceipt as receipt} from '@exactjs/core/runtime/component-operations';
import {flushSync} from '@exactjs/reactive';
import {render,unmount} from '@exactjs/dom/root';
import {createExactClient} from '@exactjs/hydrate';
export async function verify(outputs?:Record<string,{html:string;htmlWithHydration?:string;resumptions:unknown}>){
 const results:unknown[]=[];const items=[{id:'a',label:'Alpha'},{id:'b',label:'Beta'}];
 for(const [name,List]of Object.entries({${names.join(',')}})){const registration={${names.map((name) => name + ':Registration' + name).join(',')}}[name as ${names.map((name) => JSON.stringify(name)).join('|')}];
 const input=name==='Nested'?{groups:[{id:'first',items:[items[0]]},{id:'second',items:[items[1]]}]}:name==='FindingShape'?{findings:items.map(item=>({id:item.id,message:item.label,tone:'notice',tag:'source',detail:'Detail',pointsAt:item.label+' location'}))}:(name==='GenericDefaultDeeper'||name==='InferredCallbackCapture')?{items:items.map((item,index)=>({...item,box:{value:0,next:{value:index+2,next:{value:index+3}}}}))}:name==='GuardedUnionChildren'?{items,kind:'b'}:{items};
 const host=document.createElement('div');document.body.append(host);const reports:unknown[]=[];let client:ReturnType<typeof createExactClient>|undefined;
 try{
 const output=outputs?.[name];if(output)host.innerHTML=output.htmlWithHydration??output.html;const selector=name==='InferredCallbackCapture'?'button':'li';const before=[...host.querySelectorAll(selector)];
 const options={onErrorReport:(report:{error:unknown})=>reports.push(String(report.error))};
 if(output){client=createExactClient(host,{...registration,...options,resumptions:output.resumptions as never,onMismatch:'throw'});await client.whenSettled();}else render(receipt(List,input),host,options);
 const rows=[...host.querySelectorAll(selector)];const observations=[rows.map(row=>row.textContent)];
 rows[1]!.dispatchEvent(new MouseEvent(name==='InferredCallbackCapture'?'click':'mouseenter'));flushSync();observations.push(rows.map(row=>row.textContent));
 const beta=host.querySelector('p')?.textContent;
 rows[0]!.dispatchEvent(new MouseEvent(name==='InferredCallbackCapture'?'click':'mouseenter'));flushSync();observations.push(rows.map(row=>row.textContent));
 results.push({name,observations,titles:rows.map(row=>(row as HTMLElement).title),beta,alpha:host.querySelector('p')?.textContent,retained:rows.every((row,index)=>host.querySelectorAll(selector)[index]===row),adopted:!output||before.every((row,index)=>row===rows[index]),reports});
 }finally{if(client)client.dispose();else unmount(host);host.remove();}
 }return results;
}`
		);
		await assertDiagnosticBuildWarnings(
			adapter,
			root,
			target,
			await buildDiagnosticFixture(adapter, root, target, false, true, false, workspace)
		);
		const name = (await readdir(path.join(root, 'out-' + target))).find((name) =>
			/^entry\.(?:js|mjs|cjs)$/.test(name)
		);
		assert.ok(name);
		entries[target] = './out-' + target + '/' + name;
	}
	const observer = path.join(root, 'observe-server.mjs');
	await writeFile(
		observer,
		`const loaded=await import(${JSON.stringify(entries.server)}),module=loaded.outputs?loaded:loaded.default;console.log(JSON.stringify(await module.outputs()));`
	);
	const server = await promisify(execFile)(
		adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
		[observer],
		{ cwd: root }
	);
	await writeFile(path.join(root, 'server.stdout.log'), server.stdout);
	await writeFile(path.join(root, 'server.stderr.log'), server.stderr);
	const outputs = JSON.parse(server.stdout) as Record<
		string,
		{ html: string; resumptions: unknown }
	>;
	const code = await readFile(path.join(root, entries.client!), 'utf8');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage(),
			errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.route('https://island-lexical.test/**', async (route) => {
			const file = path.basename(new URL(route.request().url()).pathname);
			await route.fulfill({
				contentType: file.endsWith('.js') ? 'text/javascript' : 'text/html',
				body: file.endsWith('.js')
					? await readFile(path.join(root, 'out-client', file), 'utf8')
					: '<!doctype html><body></body>'
			});
		});
		await page.goto('https://island-lexical.test/');
		for (const mode of ['mount', 'hydrate']) {
			const actual = (await page.evaluate(
				async ({ adapter, code, outputs, mode }) => {
					let module: { verify(outputs?: unknown): unknown };
					if (adapter === 'webpack') {
						const container = { exports: {} };
						new Function('exports', 'module', code)(container.exports, container);
						module = container.exports as typeof module;
					} else
						module = await new Function('return import("https://island-lexical.test/entry.js")')();
					return module.verify(mode === 'hydrate' ? outputs : undefined);
				},
				{ adapter, code, outputs, mode }
			)) as Array<{
				name: string;
				observations: unknown;
				titles: string[];
				beta?: string;
				alpha?: string;
				retained: boolean;
				adopted: boolean;
				reports: unknown[];
			}>;
			await writeFile(
				path.join(root, mode + '-observations.json'),
				JSON.stringify({ actual, errors }, null, 2)
			);
			assert.equal(actual.length, names.length);
			for (const row of actual) {
				const captions = row.name === 'GenericDefaultDeeper' ? ['3', '4'] : ['Alpha', 'Beta'];
				if (row.name === 'InferredCallbackCapture') {
					assert.deepEqual(row.observations, [
						['Alpha', 'Beta'],
						['Alpha', 'Beta'],
						['Alpha', 'Beta']
					]);
					assert.deepEqual(row.titles, ['2', '3']);
				} else
					assert.deepEqual(row.observations, [
						captions,
						[captions[0], captions[1] + ' active'],
						[captions[0] + ' active', captions[1]]
					]);
				assert.equal(row.retained, true);
				assert.equal(row.adopted, true);
				assert.deepEqual(row.reports, []);
				if (row.name === 'FindingShape') {
					assert.equal(row.beta, 'Beta location');
					assert.equal(row.alpha, 'Alpha location');
				}
			}
			assert.deepEqual(errors, []);
			assert.equal(await page.locator('body').evaluate((body) => body.childNodes.length), 0);
		}
	} finally {
		await browser.close();
	}
}
