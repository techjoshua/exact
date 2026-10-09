import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { copyInstalledRuntimePackages } from './installed-runtime-packages.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createInstalledThemeFixture } from './installed-theme.js';

/** Publishes typed native rows and scalar tiles used beneath a continuation-owning consumer. */
export async function createInstalledReportFixture(
	mode: 'enhanced' | 'plain' | 'explicit' = 'enhanced'
) {
	const fixture = await createInstalledThemeFixture('library', 'enabled', false, {
		source: `import type {Component} from '@exactjs/core';
export function Tile(props:{value:string;label:string}){return()=> <div ${mode === 'plain' ? '' : 'theme:surface="raised"'} className="tile"><span className="tile-value">{props.value}</span><span>{props.label}</span></div>}
export function Row(props:{label:string;onEnter:()=>void}){return()=> <li onMouseEnter={props.onEnter}>{props.label}</li>}
export function Page(){return()=> <p>Library</p>}`,
		components: ['Page', 'Tile', 'Row']
	});
	try {
		await copyInstalledRuntimePackages(fixture.root, ['@exactjs/hydrate']);
		await writeFile(
			path.join(fixture.root, 'Page.tsx'),
			`import {Tile,Row} from '@fixture/page';import {peek,TaskContext,type Component} from '@exactjs/core';
function makeTiles(label:string){return [{value:label,label:'First'},{value:'B',label:'Second'}]}
function Report(props:{label:string;inputs:{audit:()=>void;hover:()=>void}}){const tiles=makeTiles(props.label);const progress={value:props.label,label:'Progress'};return()=> <article>{tiles.map(tile=><Tile key={tile.label} ${mode === 'explicit' ? 'value={tile.value} label={tile.label}' : '{...tile}'}/>)}<Tile ${mode === 'explicit' ? 'value={progress.value} label={progress.label}' : '{...progress}'}/><ul><Row label={props.label} onEnter={props.inputs.hover}/><Row {...{label:props.label,onEnter:props.inputs.hover}}/></ul></article>}
export function Workspace(this:Component<{label:string;hoverCount:number}>,props:{label:string}){this.state.label=peek(()=>props.label);this.state.hoverCount=0;function remote(value:string,task:TaskContext=TaskContext.server()){return value}const state=this.state;const inputs={audit(){state.label='Audited'},hover(){state.hoverCount++;state.label='Hovered'+state.hoverCount}};return()=> <section><button onClick={()=>remote(this.state.label)}>Audit</button><Report label={this.state.label} inputs={inputs}/></section>}
/** @exact server */
export function Page(){return()=> <main><Workspace label="A"/></main>}`
		);
		await writeFile(
			path.join(fixture.root, 'server.tsx'),
			`import {Page} from './Page.js';import {renderToHydratableString,renderToHydratableProgressiveHtmlStream} from '@exactjs/ssr';export const output=()=>renderToHydratableString(<Page/>);export const streamed=()=>new Response(renderToHydratableProgressiveHtmlStream(<Page/>)).text();`
		);
		const generator = path.join(fixture.root, 'registry.mjs');
		await writeFile(
			generator,
			`import {compileFileArtifacts,createExactArtifactGraph,createExactHydrationRegistrationModule} from ${JSON.stringify(pathToFileURL(path.join(fixture.workspace, 'packages/compiler/dist/index.js')).href)};
import {writeFile} from 'node:fs/promises';
const result=await compileFileArtifacts(${JSON.stringify(path.join(fixture.root, 'Page.tsx'))},${JSON.stringify({ rootDir: fixture.root, outDir: path.join(fixture.root, 'generated'), serverComponents: true })});
const graph=createExactArtifactGraph([result],${JSON.stringify({ packageRoot: fixture.root, rootDir: fixture.root })});
await writeFile(${JSON.stringify(path.join(fixture.root, 'hydration-registration.ts'))},createExactHydrationRegistrationModule(graph));`
		);
		await promisify(execFile)(process.execPath, [generator], { timeout: 30_000 });
		await writeFile(
			path.join(fixture.root, 'client.tsx'),
			`import {createExactClient} from '@exactjs/hydrate';import {exactHydrationRegistration} from './hydration-registration.js';
export async function exercise(html:string){const container=document.createElement('div');container.innerHTML=html;document.body.append(container);const initial=container.querySelector('li');const errors:unknown[]=[];const client=createExactClient(container,{...exactHydrationRegistration,hydration:{strategy:'eager'},onErrorReport:r=>errors.push(String(r.error))});await new Promise(r=>setTimeout(r,100));const labels=[];for(let i=0;i<2;i++){container.querySelector('li')!.dispatchEvent(new MouseEvent('mouseenter'));for(let attempt=0;attempt<100 && container.querySelector('.tile-value')!.textContent!=='Hovered'+(i+1);attempt++)await new Promise(r=>setTimeout(r,10));labels.push(container.querySelector('.tile-value')!.textContent)}const retained=initial===container.querySelector('li');client.dispose();const after=container.innerHTML;initial?.dispatchEvent(new MouseEvent('mouseenter'));const cleaned=after===container.innerHTML;container.remove();return {labels,retained,cleaned,errors};}`
		);
		return fixture;
	} catch (error) {
		await fixture.dispose();
		throw error;
	}
}
