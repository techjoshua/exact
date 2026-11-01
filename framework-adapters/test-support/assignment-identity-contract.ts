import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Executes authored assignment through each adapter's client mount and paired SSR/hydration artifacts. */
export async function verifyAssignmentIdentityContract(adapter: 'vite' | 'webpack' | 'bun') {
	const parent = path.join(workspace, '.tmp/assignment-identity-adapters');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, adapter + '-'));
	try {
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/assignment-identity', private: true, type: 'module' })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
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
			),
			readFile(
				path.join(
					workspace,
					'packages/component-composition-corpus/src/scenarios/assignment-identity.fixtures.tsx'
				),
				'utf8'
			).then((source) => writeFile(path.join(root, 'fixture.tsx'), source)),
			readFile(
				path.join(
					workspace,
					'packages/component-composition-corpus/test-support/assignment-identity-journey.mjs'
				),
				'utf8'
			).then((source) => writeFile(path.join(root, 'assignment-identity-journey.mjs'), source)),
			readFile(
				path.join(
					workspace,
					'packages/component-composition-corpus/test-support/authored-assignment-journey.mjs'
				),
				'utf8'
			).then((source) => writeFile(path.join(root, 'journey.mjs'), source))
		]);
		const entries: Partial<Record<'client' | 'server', string>> = {};
		for (const target of ['client', 'server'] as const) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				target === 'server'
					? `import {assignmentIdentityRoot} from './fixture.js';import {renderToHydratableString} from '@exactjs/ssr';
export async function serverHtml(value:number){return (await renderToHydratableString(assignmentIdentityRoot({value}),{markers:false})).htmlWithHydration;}`
					: `import {assignmentIdentityRoot,assignmentIdentityOwner} from './fixture.js';import {render,dispose} from '@exactjs/dom';import {hydrate} from '@exactjs/hydrate';import {flushSync,unwrap,watch} from '@exactjs/reactive';import {verifyAuthoredAssignment} from './journey.mjs';
export function verify(value:number,html?:string){verifyAuthoredAssignment({assignmentIdentityRoot,owner:()=>assignmentIdentityOwner,flushSync,unwrap,watch,mount:(root,container,onErrorReport)=>{if(html!==undefined)return hydrate(root,container,{allowMarkerless:true,onErrorReport});render(root,container,{onErrorReport});return container;},release:(container,mounted)=>{if(html!==undefined)mounted.dispose();dispose(container,true);}},value,html);}`
			);
			await buildDiagnosticFixture(adapter, root, target, false, true);
			const file = (await readdir(path.join(root, 'out-' + target))).find((name) =>
				/^entry\.(?:js|mjs|cjs)$/.test(name)
			);
			assert.ok(file, `${adapter}/${target} has no executable assignment artifact`);
			entries[target] = './out-' + target + '/' + file;
		}
		const runtime = adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath;
		await writeFile(
			path.join(root, 'server.mjs'),
			`import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {authoredAssignmentValues} from './journey.mjs';
const imported=await import(${JSON.stringify(entries.server)});const fixture=imported.serverHtml?imported:imported.default;const html=[];
for(const value of authoredAssignmentValues){const output=await fixture.serverHtml(value);assert.equal((output.match(/1:1/g)||[]).length,2);html.push(output);}
await writeFile(new URL('./server.json',import.meta.url),JSON.stringify(html));`
		);
		await promisify(execFile)(runtime, [path.join(root, 'server.mjs')], {
			cwd: root,
			timeout: 30000
		});
		await writeFile(
			path.join(root, 'client.mjs'),
			`import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';import {authoredAssignmentValues} from './journey.mjs';
const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/'});
for(const name of ['window','document','Node','NodeFilter','Text','Comment','Document','DocumentFragment','ShadowRoot','Element','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLOptionElement','HTMLOptGroupElement','HTMLFormElement','HTMLButtonElement','HTMLDialogElement','HTMLScriptElement','SVGElement','MathMLElement','Event','MouseEvent','CustomEvent','MutationObserver','DOMParser','CSSStyleDeclaration'])if(dom.window[name])globalThis[name]=dom.window[name];
try{const imported=await import(${JSON.stringify(entries.client)});const fixture=imported.verify?imported:imported.default;const html=JSON.parse(await readFile(new URL('./server.json',import.meta.url),'utf8'));
for(const [index,value] of authoredAssignmentValues.entries()){fixture.verify(value);fixture.verify(value,html[index]);}
console.log(JSON.stringify({adapter:${JSON.stringify(adapter)},mount:2,hydration:2,verified:true}));}finally{dom.window.close();}`
		);
		const result = await promisify(execFile)(runtime, [path.join(root, 'client.mjs')], {
			cwd: root,
			timeout: 30000
		});
		assert.deepEqual(JSON.parse(result.stdout.trim()), {
			adapter,
			mount: 2,
			hydration: 2,
			verified: true
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
