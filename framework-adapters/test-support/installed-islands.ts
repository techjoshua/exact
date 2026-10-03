import { cp, mkdir, mkdtemp, rm, writeFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { copyInstalledRuntimePackages } from './installed-runtime-packages.js';

/** Creates an independently compiled, source-removed library and isolated split-island consumer. */
export async function createInstalledIslandsFixture(
	stream: boolean,
	fault?: 'missing-facts' | 'incompatible-facts' | 'missing-client'
) {
	const workspace = fileURLToPath(new URL('../../', import.meta.url));
	const root = await mkdtemp(path.join(tmpdir(), 'exact-installed-islands-'));
	const dispose = () => rm(root, { recursive: true, force: true });
	try {
		const packages = [
			'core',
			'dom',
			'ssr',
			'jsx',
			'reactive',
			'component-library',
			'hydrate',
			'server'
		];
		await copyInstalledRuntimePackages(
			root,
			packages.map((name) => '@exactjs/' + name)
		);
		const producer = path.join(root, 'producer');
		await mkdir(path.join(producer, 'src'), { recursive: true });
		await writeFile(
			path.join(producer, 'package.json'),
			JSON.stringify({
				name: '@fixture/islands',
				version: '1.0.0',
				type: 'module',
				files: ['dist'],
				exports: {
					'.': {
						types: './dist/index.d.ts',
						browser: './dist/client/index.js',
						default: './dist/server/index.js'
					}
				},
				exactCompiledComponents: ['InstalledCounter'],
				exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' },
				dependencies: Object.fromEntries(packages.map((name) => ['@exactjs/' + name, '^0.7.0']))
			})
		);
		await writeFile(
			path.join(producer, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: 'react-jsx',
					jsxImportSource: '@exactjs/jsx',
					strict: true,
					skipLibCheck: true,
					declaration: true,
					emitDeclarationOnly: true,
					rootDir: 'src',
					outDir: 'dist'
				},
				include: ['src']
			})
		);
		await writeFile(
			path.join(producer, 'src/index.ts'),
			"export {Counter as InstalledCounter} from './Counter.js'; export {rowWorkSignals,releaseRowWork} from './work.js';"
		);
		await writeFile(
			path.join(producer, 'src/label.ts'),
			'export function label(value:number){return "Count "+value;}'
		);
		await writeFile(
			path.join(producer, 'src/work.ts'),
			`const gates:{signal:AbortSignal;release:()=>void}[]=[];
export function waitForRowWork(signal:AbortSignal){return new Promise<void>(release=>gates.push({signal,release}));}
export function rowWorkSignals(){return gates.map(gate=>gate.signal);}
export function releaseRowWork(index:number){gates[index].release();}`
		);
		await writeFile(
			path.join(producer, 'src/Row.tsx'),
			`import {TaskContext,type Component} from '@exactjs/core';import {waitForRowWork} from './work.js';
export function Row(this:Component<{clicks:number;result:string}>,{value,prefix='Row'}:{value:number;prefix?:string}){
 this.state.clicks=0;this.state.result='idle';
 const run=async(input=value,task:TaskContext=TaskContext.client().latest().blocking())=>{this.state.result='pending';await waitForRowWork(task.signal);this.state.result=String(input);};
 return()=> <section data-row-owner><button data-row data-prefix={prefix} onClick={()=>this.state.clicks++}>{value}:{this.state.clicks}</button><button data-row-task onClick={()=>run()}>Run</button><output data-row-result>{this.state.result}</output></section>;
}`
		);
		await writeFile(
			path.join(producer, 'src/Counter.tsx'),
			`import {createComponentRegistry as registry,Activity,TaskContext,type Component,type KeyOf} from '@exactjs/core';import * as Framework from '@exactjs/core';void Activity;
import {Row} from './Row.js';import {label} from './label.js';
const Views=${stream ? 'Framework.createComponentRegistry' : 'registry'}(({lazy})=>({a:Row,b:lazy(()=>import('./Row.js').then(module=>module.Row))}));
export function Counter(this:Component<{value:number;selected:KeyOf<typeof Views>}>){
 this.state.value=7;this.state.selected='a';
 function increment(_task:TaskContext=TaskContext.server()){this.state.value++;}
 function replace(_task:TaskContext=TaskContext.server()){this.state.selected=this.state.selected==='a'?'b':'a';}
 const Activity=Views[this.state.selected];
 return()=> <article><button data-increment onClick={()=>increment()}>{label(this.state.value)}</button><button data-replace onClick={()=>replace()}>Replace</button><Activity value={this.state.value} prefix={this.state.value%2?'Odd':undefined}/></article>;
}`
		);
		const build = path.join(root, 'produce.mjs');
		await writeFile(
			build,
			`import {buildLibrary} from ${JSON.stringify(pathToFileURL(path.join(workspace, 'packages/compiler/dist/library-build.js')).href)};await buildLibrary({root:${JSON.stringify(producer)}});`
		);
		await promisify(execFile)(process.execPath, [build], { timeout: 30_000 });
		const installed = path.join(root, 'node_modules/@fixture/islands');
		await mkdir(installed, { recursive: true });
		await cp(path.join(producer, 'dist'), path.join(installed, 'dist'), { recursive: true });
		await cp(path.join(producer, 'package.json'), path.join(installed, 'package.json'));
		await rm(producer, { recursive: true });
		assert.deepEqual((await readdir(installed)).sort(), ['dist', 'package.json']);
		if (fault === 'missing-facts')
			await rm(path.join(installed, 'dist/exact-component-build.json'));
		else if (fault === 'incompatible-facts') {
			const filename = path.join(installed, 'dist/exact-component-build.json');
			const facts = JSON.parse(await readFile(filename, 'utf8'));
			await writeFile(filename, JSON.stringify({ ...facts, protocol: 99 }));
		} else if (fault === 'missing-client')
			await rm(path.join(installed, 'dist/client'), { recursive: true });
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({
				name: 'isolated-island-consumer',
				private: true,
				type: 'module',
				dependencies: { '@fixture/islands': '1.0.0' }
			})
		);
		await writeFile(path.join(root, 'exact.config.mjs'), 'export default {};');
		await writeFile(
			path.join(root, 'Page.tsx'),
			`import {InstalledCounter} from '@fixture/islands';
/** @exact server */
export function Page(){return()=> <section><span data-utf8>café 🙂</span><input aria-label="Draft" value="Initial"/><InstalledCounter/></section>;}`
		);
		await writeFile(
			path.join(root, 'server.tsx'),
			`import {Page} from './Page.js';import {InstalledCounter} from '@fixture/islands';
import {composeExactExecutorContract,createExactHydrationConfig,createFetchHandler} from '@exactjs/server';
import {createExactServerRuntime,${stream ? 'renderToHydratableProgressiveHtmlStream' : 'renderToHydratableString'}} from '@exactjs/ssr';
const contract=composeExactExecutorContract([InstalledCounter],{endpoint:'/__exact'});
export const handleExact=createFetchHandler(createExactServerRuntime({contract,patchStrategy:'element'}));
export const renderPage=${stream ? `async()=>({htmlWithHydration:await new Response(renderToHydratableProgressiveHtmlStream(<Page/>,createExactHydrationConfig(contract))).text()})` : `()=>renderToHydratableString(<Page/>,createExactHydrationConfig(contract));`}`
		);
		await writeFile(
			path.join(root, 'client.ts'),
			`import {InstalledCounter} from '@fixture/islands';export {rowWorkSignals,releaseRowWork} from '@fixture/islands';
import {createExactClient,readExactHydrationConfig} from '@exactjs/hydrate';
import {composeExactComponentContracts} from '@exactjs/core/framework/component-contracts';
const registration=composeExactComponentContracts([InstalledCounter],'client');
export const mountPage=(root:Element,options={})=>createExactClient(root,{...readExactHydrationConfig(root),islands:registration.implementations,continuations:registration.continuations,...options});`
		);
		return { root, workspace, dispose };
	} catch (error) {
		await dispose();
		throw error;
	}
}
