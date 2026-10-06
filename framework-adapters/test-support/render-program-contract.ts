import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Runs one shared native property-order fixture through each adapter's executable artifacts. */
export async function verifyRenderProgramContract(adapter: 'vite' | 'webpack' | 'bun') {
	const parent = path.resolve('.tmp/render-program-adapters');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, adapter + '-'));
	try {
		const source = await readFile(
			path.resolve(
				'packages/component-composition-corpus/src/test-support/render-attribute-order.fixtures.tsx'
			),
			'utf8'
		);
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/render-program', type: 'module', private: true })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						jsx: 'preserve',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						strict: true
					},
					include: ['*.tsx']
				})
			),
			writeFile(path.join(root, 'fixture.tsx'), source)
		]);
		for (const target of ['client', 'server'] as const) {
			const verification =
				target === 'server'
					? `import {renderToString} from '@exactjs/ssr';export async function verify(){return (await renderToString(attributeOrderRoot())).html;}`
					: `import {render,unmount} from '@exactjs/dom';import {flushSync} from '@exactjs/reactive';export async function verify(){const host=document.createElement('div');const reports:unknown[]=[];try{render(attributeOrderRoot(),host,{onErrorReport:r=>reports.push(r.error)});if(reports.length)throw reports[0];const fixed=host.querySelector('div')!;const spread=host.querySelectorAll('div')[1];const initial=[fixed.title,spread.title];attributeOrderOwner.state.bag={title:'updated'};flushSync();const updated=[fixed.title,spread.title,fixed===host.querySelector('div')];(host.querySelector('[data-generation-step]') as HTMLButtonElement).click();const output=host.querySelector('[data-generation-state]')!;for(let tick=0;tick<100&&output.textContent!=='published';tick++)await new Promise(resolve=>setTimeout(resolve,5));const generation=output.textContent;unmount(host);return {initial,updated,generation,remaining:host.childNodes.length,reports};}finally{unmount(host);}}`;
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import {attributeOrderRoot,attributeOrderOwner} from './fixture.js';${verification}`
			);
			await buildDiagnosticFixture(adapter, root, target, false, true);
			const entry = (await readdir(path.join(root, 'out-' + target))).find((file) =>
				/^entry\.(?:js|mjs|cjs)$/.test(file)
			);
			assert.ok(entry, `${adapter}/${target} has no executable artifact`);
			const runner = path.join(root, 'verify-' + target + '.mjs');
			await writeFile(
				runner,
				`import assert from 'node:assert/strict';
${target === 'client' ? `import {JSDOM} from 'jsdom';const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/'});for(const name of ['window','document','Node','NodeFilter','Text','Comment','Document','DocumentFragment','ShadowRoot','Element','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLOptionElement','HTMLFormElement','HTMLButtonElement','HTMLDialogElement','SVGElement','MathMLElement','Event','MouseEvent','CustomEvent','MutationObserver','DOMParser','CSSStyleDeclaration'])if(dom.window[name])globalThis[name]=dom.window[name];` : ''}
try{const imported=await import(${JSON.stringify('./out-' + target + '/' + entry)});const fixture=imported.verify?imported:imported.default;const result=await fixture.verify();
${target === 'client' ? `assert.deepEqual(result,{initial:['fixed','spread'],updated:['fixed','updated',true],generation:'published',remaining:0,reports:[]});` : `assert.match(result,/title="fixed"/);assert.match(result,/title="spread"/);`}
}finally{${target === 'client' ? 'dom.window.close();' : ''}}`
			);
			await promisify(execFile)(process.execPath, [runner], { cwd: root });
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
