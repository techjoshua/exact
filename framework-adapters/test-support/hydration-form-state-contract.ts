import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Verifies dirty control ownership through each adapter's paired artifacts and hydration recovery. */
export async function verifyHydrationFormStateContract(adapter: 'vite' | 'webpack' | 'bun') {
	const parent = path.resolve('.tmp/hydration-form-state-adapters');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, adapter + '-'));
	try {
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({ name: '@fixture/hydration-form-state', private: true, type: 'module' })
		);
		await writeFile(
			path.join(root, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					target: 'ESNext',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: 'preserve',
					strict: true
				},
				include: ['*.tsx']
			})
		);
		await writeFile(
			path.join(root, 'entry.tsx'),
			`import {hydrate} from '@exactjs/hydrate';
import {renderToString} from '@exactjs/ssr';
export function Page(){return()=> <section><input id="upload" type="file"/><input id="draft" value="server"/><details id="disclosure" data-exact-ssr-open="false" open><summary>More</summary>Content</details><dialog id="early-dialog" DATA-EXACT-SSR-OPEN="false" open>Message</dialog><select id="choice"><option value="a" selected>A</option><option value="b">B</option></select></section>;}
export async function serverHtml(maxOutputBytes?:number){return (await renderToString(<Page/>,{markers:false,maxOutputBytes})).html;}
export function hydratePage(container:Element){return hydrate(<Page/>,container,{allowMarkerless:true});}`
		);
		const entries: Partial<Record<'client' | 'server', string>> = {};
		for (const target of ['client', 'server'] as const) {
			await buildDiagnosticFixture(adapter, root, target, false, true);
			const files = await readdir(path.join(root, 'out-' + target));
			const file = files.find((name) => /^entry\.(?:js|mjs|cjs)$/.test(name));
			assert.ok(file, `${adapter} produced no ${target} entry`);
			entries[target] = './out-' + target + '/' + file;
		}
		const serverRunner = path.join(root, 'server.mjs');
		await writeFile(
			serverRunner,
			`import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
const imported=await import(${JSON.stringify(entries.server)});const fixture=imported.serverHtml?imported:imported.default;
const html=await fixture.serverHtml();
if((html.match(/data-exact-ssr-open=/gi)||[]).length!==2)throw new Error('Each native open control must own one consistent server baseline: '+html);
const bytes=new TextEncoder().encode(html).byteLength;assert.equal(await fixture.serverHtml(bytes),html);await assert.rejects(()=>fixture.serverHtml(bytes-1),{name:'SsrOutputLimitError'});
await writeFile(new URL('./server.html',import.meta.url),html);`
		);
		await promisify(execFile)(process.execPath, [serverRunner], { cwd: root });
		const clientRunner = path.join(root, 'client.mjs');
		await writeFile(
			clientRunner,
			`import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/'});
for(const name of ['window','document','Node','NodeFilter','Text','Comment','Document','DocumentFragment','ShadowRoot','Element','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLOptionElement','HTMLOptGroupElement','HTMLFormElement','HTMLButtonElement','HTMLDialogElement','HTMLScriptElement','SVGElement','MathMLElement','Event','MouseEvent','CustomEvent','MutationObserver','DOMParser','CSSStyleDeclaration'])if(dom.window[name])globalThis[name]=dom.window[name];
try {
 const imported=await import(${JSON.stringify(entries.client)});const fixture=imported.hydratePage?imported:imported.default;const html=await readFile(new URL('./server.html',import.meta.url),'utf8');
 for(const replace of [false,true]) {
  const container=document.createElement('main');container.innerHTML=html;document.body.append(container);let client;
  try {
   if(replace){const section=container.querySelector('section');const article=document.createElement('article');article.append(...section.childNodes);section.replaceWith(article);}
   container.querySelector('#disclosure').open=false;container.querySelector('#early-dialog').open=false;
   const upload=container.querySelector('#upload');let pathWrites=0;
   Object.defineProperty(upload,'value',{get:()=> 'C:\\\\fakepath\\\\proof.txt',set:()=>{pathWrites++;throw new DOMException('Selected file path cannot be assigned','InvalidStateError');}});
   const input=container.querySelector('#draft');input.value='typed before hydration';input.focus();input.setSelectionRange(2,7);
   container.querySelector('#choice').value='b';
   client=fixture.hydratePage(container);
   const restored=container.querySelector('#draft');assert.equal(restored.value,'typed before hydration');assert.equal(document.activeElement,restored);assert.equal(restored.selectionStart,2);assert.equal(restored.selectionEnd,7);
   assert.equal(container.querySelector('#choice').value,'b');
   assert.equal(container.querySelector('#disclosure').open,false);assert.equal(container.querySelector('#early-dialog').open,false);assert.equal(pathWrites,0);
   assert.equal(container.querySelector('#upload')===upload,!replace);
   if(replace)assert.equal(container.querySelector('#upload').value,'');
  } finally {client?.dispose();container.remove();}
 }
} finally {dom.window.close();}`
		);
		await promisify(execFile)(process.execPath, [clientRunner], { cwd: root });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
