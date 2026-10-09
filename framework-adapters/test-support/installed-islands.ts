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
			'server',
			'intl',
			'motion'
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
				files: ['dist', 'styles'],
				sideEffects: ['**/*.css'],
				exports: {
					'./styles.css': './styles/library.css',
					'.': {
						types: './dist/index.d.ts',
						browser: './dist/client/index.js',
						default: './dist/server/index.js'
					}
				},
				exactCompiledComponents: [
					'InstalledCounter',
					'LocalCounter',
					'ControlScope',
					'ControlButton'
				],
				exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' },
				dependencies: Object.fromEntries(packages.map((name) => ['@exactjs/' + name, '^0.7.0']))
			})
		);
		await mkdir(path.join(producer, 'styles'));
		await writeFile(
			path.join(producer, 'styles/library.css'),
			'[data-local-counter] { color: rgb(13 17 19); }\n'
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
			"export {Counter as InstalledCounter} from './Counter.js'; export {LocalCounter,localLifecycleCounts} from './LocalCounter.js'; export {ControlScope,ControlButton} from './ControlScope.js'; export {rowWorkSignals,releaseRowWork,rowWorkEvents,dispatchRowWorkEvent,rowResourceReleases,rowFallbackResourceReleases,rowLexicalResourceReleases} from './work.js';"
		);
		await writeFile(
			path.join(producer, 'src/ControlScope.tsx'),
			`import {createContext,type Child,type Component} from '@exactjs/core';
import motion from '@exactjs/motion' with {type:'exact-enhancement'};
const Control=createContext<{readonly count:number;increment():void}>('@fixture/control');
export function ControlScope(this:Component<{count:number}>,props:{initial:number;children?:Child|Child[]}){this.state.count=props.initial;const state=this.state;this.setContext(Control,{get count(){return state.count;},increment(){state.count++;}});return()=> <section motion:change={undefined} data-control-scope data-count={this.state.count}>{props.children}</section>;}
export function ControlButton(this:Component<Record<string,never>>){const control=this.getContext(Control);return()=> <button data-scope-control onClick={()=>control.increment()}>Scope {control.count}</button>;}`
		);
		await writeFile(
			path.join(producer, 'src/LocalCounter.tsx'),
			`import type {Component} from '@exactjs/core';
let mounts=0,releases=0;export function localLifecycleCounts(){return {mounts,releases};}
export function LocalCounter(this:Component<{count:number}>,props:{onEnter?:()=>void;onLeave?:()=>void}){this.state.count=0;const owner=this;const callbacks={increment(){owner.state.count++;}};this.onMount(()=>{mounts++;});this.onUnmount(()=>{releases++;});return()=> <li data-local-counter onMouseEnter={props.onEnter} onMouseLeave={props.onLeave}><button onClick={()=>callbacks.increment()}>Local {this.state.count}</button></li>;}`
		);
		await writeFile(
			path.join(producer, 'src/label.ts'),
			'export function label(value:number){return "Count "+value;}'
		);
		await writeFile(
			path.join(producer, 'src/work.ts'),
			`/// <reference lib="esnext.disposable" />
const gates:{signal:AbortSignal;release:()=>void}[]=[];
let lexicalReleases=0;export class RowLexicalResource {[Symbol.dispose](){lexicalReleases++;}}export function rowLexicalResourceReleases(){return lexicalReleases;}
let fallbackReleases=0;export class RowFallbackResource {[Symbol.dispose](){fallbackReleases++;}}export function rowFallbackResourceReleases(){return fallbackReleases;}
let releases=0;export class RowResource {[Symbol.dispose](){releases++;}}export function rowResourceReleases(){return releases;}
export const rowEventTarget=new EventTarget();let events=0;export function recordRowWorkEvent(){events++;}export function rowWorkEvents(){return events;}type SharedRowEventTarget=EventTarget;export function dispatchRowWorkEvent(target:Readonly<SharedRowEventTarget>=rowEventTarget){target.dispatchEvent(new Event('row-work-probe'));}
export function waitForRowWork(signal:AbortSignal){return new Promise<void>(release=>gates.push({signal,release}));}
export function rowWorkSignals(){return gates.map(gate=>gate.signal);}
export function releaseRowWork(index:number){gates[index].release();}`
		);
		await writeFile(
			path.join(producer, 'src/numeric-range.ts'),
			await readFile(
				path.join(
					workspace,
					'packages/component-composition-corpus/src/test-support/intl-numeric-range-values.ts'
				)
			)
		);
		await writeFile(
			path.join(producer, 'src/FormBinding.tsx'),
			await readFile(
				path.join(
					workspace,
					'packages/component-composition-corpus/src/test-support/form-binding.fixtures.tsx'
				)
			)
		);
		await writeFile(
			path.join(producer, 'src/Row.tsx'),
			`import {TaskContext,peek as snapshot,type Component} from '@exactjs/core';import * as Core from '@exactjs/core';import {waitForRowWork,recordRowWorkEvent,rowEventTarget,RowResource,RowFallbackResource,RowLexicalResource} from './work.js';import {rangeLabel} from './numeric-range.js';import {FormBindingProbe} from './FormBinding.js';
export function Row(this:Component<{clicks:number;result:string;seed:number}>,{value,prefix='Row'}:{value:number;prefix?:string}){
 this.state.clicks=0;this.state.result='idle';this.state.seed=0;
 const optionalDate=value%2===0?new Date(0):null;const initial=snapshot(()=>value);const namespaced=Core.peek(()=>value);const read=()=>value*2;const first=read;const table={read:first};const alias=table['read'] satisfies ()=>number;const doubled=alias();function peek(input:number){return input;}const live=peek(value);
 function initialize(input:number,task?:TaskContext):void;function initialize(input:string,task?:TaskContext):void;function initialize(input:number|string,task:TaskContext=TaskContext.client()){this.state.seed=typeof input==='number'?input:input.length;}initialize(...([value] as const));
 const run=async(input=value,task:TaskContext=TaskContext.client().latest().blocking())=>{this.state.result='pending';using lexical=new RowLexicalResource();void lexical;const resource=new RowResource();resource[Symbol.dispose]();const owned=new RowResource();const registered=task.own(owned);if(registered!==owned)throw new Error('Resource identity changed');const fallback=new RowFallbackResource();const eager=new RowFallbackResource();if(input<0)fallback[Symbol.dispose]();if(input>=0)eager[Symbol.dispose]();const target=rowEventTarget;target.addEventListener('row-work-probe',()=>recordRowWorkEvent(),true);await waitForRowWork(task.signal);this.state.result=String(input);};
 return()=> <section data-row-owner><FormBindingProbe/><button data-row data-prefix={prefix} data-seed={this.state.seed} data-snapshot={initial} data-namespace-snapshot={namespaced} data-alias={doubled} data-live={live} data-range={rangeLabel(7,value)} data-optional-locale={optionalDate?.toLocaleString('en-US',{timeZone:'UTC'})} onClick={()=>this.state.clicks++}>{value}:{this.state.clicks}</button><button data-row-task onClick={()=>run()}>Run</button><output data-row-result>{this.state.result}</output></section>;
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
 return()=> <article {...{title:'counter'}} className={['counter',{'2':this.state.value%2===1,'1':this.state.value%2===1,'__proto__':true}]}><button data-increment onClick={()=>increment()}>{label(this.state.value)}</button><button data-replace onClick={()=>replace()}>Replace</button><Activity value={this.state.value} prefix={this.state.value%2?'Odd':undefined}/></article>;
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
		await cp(path.join(producer, 'styles'), path.join(installed, 'styles'), { recursive: true });
		await rm(producer, { recursive: true });
		assert.deepEqual((await readdir(installed)).sort(), ['dist', 'package.json', 'styles']);
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
			`import {InstalledCounter,LocalCounter,ControlScope,ControlButton} from '@fixture/islands';
/** @exact server */
export function Page(){return()=> <section><span data-utf8>café 🙂</span><input aria-label="Draft" value="Initial"/><ControlScope initial={3}><div><ControlButton/></div></ControlScope><InstalledCounter/><ul><LocalCounter onEnter={()=>{}} onLeave={()=>{}}/></ul></section>;}`
		);
		if (!fault) {
			const registryBuilder = path.join(root, 'registry.mjs');
			await writeFile(
				registryBuilder,
				`import {compileFileArtifacts,createExactArtifactGraph,createExactHydrationRegistrationModule} from ${JSON.stringify(pathToFileURL(path.join(workspace, 'packages/compiler/dist/index.js')).href)};
import {writeFile} from 'node:fs/promises';
const result=await compileFileArtifacts(${JSON.stringify(path.join(root, 'Page.tsx'))},${JSON.stringify({ rootDir: root, outDir: path.join(root, 'generated'), serverComponents: true })});
const graph=createExactArtifactGraph([result],${JSON.stringify({ packageRoot: root, rootDir: root })});
await writeFile(${JSON.stringify(path.join(root, 'hydration-registration.ts'))},createExactHydrationRegistrationModule(graph));`
			);
			await promisify(execFile)(process.execPath, [registryBuilder], { timeout: 30000 });
		}
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
			path.join(root, 'client.tsx'),
			`import '@fixture/islands/styles.css';import {InstalledCounter,LocalCounter} from '@fixture/islands';export function localReceipt(){return <LocalCounter/>;}export {localLifecycleCounts,rowWorkSignals,releaseRowWork,rowWorkEvents,dispatchRowWorkEvent,rowResourceReleases,rowFallbackResourceReleases,rowLexicalResourceReleases} from '@fixture/islands';
import {createExactClient,readExactHydrationConfig} from '@exactjs/hydrate';
${fault ? `import {composeExactComponentContracts} from '@exactjs/core/framework/component-contracts';const composed=composeExactComponentContracts([InstalledCounter,LocalCounter],'client');const registration={islands:composed.implementations,continuations:composed.continuations};` : "import {exactHydrationRegistration as registration} from './hydration-registration.js';"}
export const mountPage=(root:Element,options={})=>createExactClient(root,{...readExactHydrationConfig(root),...registration,...options});`
		);
		return { root, workspace, dispose };
	} catch (error) {
		await dispose();
		throw error;
	}
}
