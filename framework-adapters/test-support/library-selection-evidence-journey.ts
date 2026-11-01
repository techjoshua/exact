import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Uses the existing owned subprocess/JSDOM pattern for actual library execution and strict adoption. */
export async function verifyLibrarySelectionExecution(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	fixture: string,
	packageRoot?: string
) {
	const entries: Partial<Record<'client' | 'server', string>> = {};
	for (const target of ['client', 'server'] as const) {
		await writeFile(path.join(root, 'fixture.tsx'), fixture);
		const source =
			target === 'server'
				? `import {libraryRoot} from './fixture.js';import {renderToHydratableString} from '@exactjs/ssr';export async function serverHtml(){const reports:unknown[]=[];const result=await renderToHydratableString(libraryRoot(),{markers:false,logger:{log(event){if(event.level==='error'||event.level==='warn')reports.push(event)}}});if(reports.length)throw Error('unexpected SSR framework report');return result.htmlWithHydration;}`
				: `import {libraryRoot} from './fixture.js';
import {render,dispose} from '@exactjs/dom';
import {hydrate,type ExactHydrationObservation} from '@exactjs/hydrate';
export async function verify(html?:string){
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
  if(html===undefined)render(libraryRoot(),container,{onErrorReport,logger});
  else{
   container.innerHTML=html;
   const original=container.querySelector('[data-library-selection]');
   if(!original)throw Error('missing markerless SSR library node');
   mounted=hydrate(libraryRoot(),container,{
    allowMarkerless:true,onMismatch:'throw',onErrorReport,logger,
    onDiagnostic(diagnostic){reports.push(diagnostic)},
    onHydration(observation){observations.push(observation)}
   });
   await mounted.whenSettled();
   if(observations.length!==1||observations[0].kind!=='root'||observations[0].outcome!=='adopted'||observations[0].markers!=='markerless')throw Error('expected one adopted markerless root');
   if(container.querySelector('[data-library-selection]')!==original)throw Error('markerless hydration replaced SSR library node');
  }
  if(container.querySelector('[data-library-selection]')?.textContent!=='library-selected')throw Error('library callback body changed');
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
		await buildDiagnosticFixture(adapter, root, target, false, true, false, packageRoot);
		const name = (await readdir(path.join(root, 'out-' + target))).find((name) =>
			/^entry\.(?:js|mjs|cjs)$/.test(name)
		);
		assert.ok(name, `${adapter}/${target} missing library artifact`);
		entries[target] = './out-' + target + '/' + name;
	}
	await writeFile(
		path.join(root, 'server.mjs'),
		`import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';const imported=await import(${JSON.stringify(entries.server)});const fixture=imported.serverHtml?imported:imported.default;const html=await fixture.serverHtml();assert.ok(html.includes('data-library-selection'));assert.ok(html.includes('library-selected'));await writeFile(new URL('./server.html',import.meta.url),html);`
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
