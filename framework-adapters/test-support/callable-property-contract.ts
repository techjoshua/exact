import { createCompilerSession, inspectExactComponentBuildFacts } from '@exactjs/compiler';
import { callablePropertyFixture } from './callable-property-fixture.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Preserves source effects and descriptive uncertainty while ordinary adapter builds remain allowed. */
export async function verifyCallablePropertyContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
) {
	const fixture = callablePropertyFixture;
	const mutation =
		fixture +
		"export function mutate(){Object.defineProperty(source,'run',{get(){return document.title}})}export function enter(){mutate();return <Page/>}";
	for (const target of ['client', 'server'] as const) {
		await writeFile(
			path.join(root, 'entry.tsx'),
			target === 'server' ? fixture.replace('document.title.length', 'process.pid') : fixture
		);
		await buildDiagnosticFixture(adapter, root, target, false, true);
		const uncertain =
			target === 'server' ? mutation.replace('document.title.length', 'process.pid') : mutation;
		const filename = path.join(root, 'entry.tsx');
		await writeFile(filename, uncertain);
		const session = createCompilerSession();
		try {
			const facts = inspectExactComponentBuildFacts(uncertain, {
				filename,
				root,
				configFile: path.join(root, 'tsconfig.json'),
				session,
				target,
				serverComponents: true
			});
			assert.equal(facts.components.length, 1);
			assert.equal(facts.components[0].placement, 'unknown');
			assert.deepEqual(facts.components[0].artifactTargets, []);
		} finally {
			session.dispose();
		}
		await buildDiagnosticFixture(adapter, root, target);
	}
	await verifyCallablePropertyExecution(adapter, root, fixture);
}

/** Connects the same fixture to client mount, server rendering and hydration. */
async function verifyCallablePropertyExecution(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	fixture: string
) {
	const entries: Partial<Record<'client' | 'server', string>> = {};
	for (const target of ['client', 'server'] as const) {
		await writeFile(
			path.join(root, 'fixture.tsx'),
			target === 'server' ? fixture.replace('document.title.length', 'process.pid') : fixture
		);
		const source =
			target === 'server'
				? `import {callablePropertyRoot,selectedProbe} from './fixture.js';import {renderToHydratableString} from '@exactjs/ssr';export async function serverHtml(){if(selectedProbe()!==process.pid)throw Error('lost server body');const reports:unknown[]=[];const result=await renderToHydratableString(callablePropertyRoot(),{markers:false,logger:{log(event){if(event.level==='error'||event.level==='warn')reports.push(event)}}});if(reports.length)throw Error('unexpected SSR framework report');return result.htmlWithHydration;}`
				: `import {callablePropertyRoot,selectedProbe} from './fixture.js';
import {render,dispose} from '@exactjs/dom';
import {hydrate,type ExactHydrationObservation} from '@exactjs/hydrate';
export async function verify(html?:string){
 document.title='callable';
 const container=document.createElement('div');
 const reports:unknown[]=[];
 const observations:ExactHydrationObservation[]=[];
 const onErrorReport=(report:unknown)=>{reports.push(report)};
 const logger:NonNullable<Parameters<typeof hydrate>[2]>['logger']={log(event){if(event.level==='warn'||event.level==='error')reports.push(event)}};
 let mounted:ReturnType<typeof hydrate>|undefined;
 let failed=false;
 let failure:unknown;
 try{
  document.body.append(container);
  if(html===undefined)render(callablePropertyRoot(),container,{onErrorReport,logger});
  else{
   container.innerHTML=html;
   const original=container.querySelector('[data-callable-property]');
   if(!original)throw Error('missing markerless SSR callable node');
   mounted=hydrate(callablePropertyRoot(),container,{
    allowMarkerless:true,onMismatch:'throw',onErrorReport,logger,
    onDiagnostic(diagnostic){reports.push(diagnostic)},
    onHydration(observation){observations.push(observation)}
   });
   await mounted.whenSettled();
   if(observations.length!==1||observations[0].kind!=='root'||observations[0].outcome!=='adopted'||observations[0].markers!=='markerless')throw Error('expected one adopted markerless root');
   if(container.querySelector('[data-callable-property]')!==original)throw Error('markerless hydration replaced SSR callable node');
  }
  if(container.querySelector('[data-callable-property]')?.textContent!=='0:function')throw Error('neutral operation changed');
  if(selectedProbe()!==8)throw Error('lost browser body');
 }catch(error){failed=true;failure=error}
 finally{
  for(const release of [()=>mounted?.dispose(),()=>dispose(container,true),()=>container.remove()]){
   try{release()}catch(error){if(!failed){failed=true;failure=error}}
  }
 }
 if(failed)throw failure;
 if(reports.length)throw Error('unexpected client framework report');
}`;
		await writeFile(path.join(root, 'entry.tsx'), source);
		await buildDiagnosticFixture(adapter, root, target, false, true);
		const name = (await readdir(path.join(root, 'out-' + target))).find((name) =>
			/^entry\.(?:js|mjs|cjs)$/.test(name)
		);
		assert.ok(name, `${adapter}/${target} missing callable artifact`);
		entries[target] = './out-' + target + '/' + name;
	}
	await writeFile(
		path.join(root, 'server.mjs'),
		`import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';const imported=await import(${JSON.stringify(entries.server)});const fixture=imported.serverHtml?imported:imported.default;const html=await fixture.serverHtml();assert.ok(html.includes('data-callable-property'));assert.ok(html.includes('0:function'));await writeFile(new URL('./server.html',import.meta.url),html);`
	);
	const runtime = adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath;
	await promisify(execFile)(runtime, [path.join(root, 'server.mjs')], {
		cwd: root,
		timeout: 30000
	});
	await writeFile(
		path.join(root, 'client.mjs'),
		`import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/'});for(const name of ['window','document','Node','NodeFilter','Text','Comment','Document','DocumentFragment','ShadowRoot','Element','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLOptionElement','HTMLOptGroupElement','HTMLFormElement','HTMLButtonElement','HTMLDialogElement','HTMLScriptElement','SVGElement','MathMLElement','Event','MouseEvent','CustomEvent','MutationObserver','DOMParser','CSSStyleDeclaration'])if(dom.window[name])globalThis[name]=dom.window[name];try{const imported=await import(${JSON.stringify(entries.client)});const fixture=imported.verify?imported:imported.default;await fixture.verify();await fixture.verify(await readFile(new URL('./server.html',import.meta.url),'utf8'));console.log(JSON.stringify({adapter:${JSON.stringify(adapter)},mount:1,hydration:1,verified:true}));}finally{dom.window.close();}`
	);
	const result = await promisify(execFile)(runtime, [path.join(root, 'client.mjs')], {
		cwd: root,
		timeout: 30000
	});
	assert.deepEqual(JSON.parse(result.stdout.trim()), {
		adapter,
		mount: 1,
		hydration: 1,
		verified: true
	});
}
