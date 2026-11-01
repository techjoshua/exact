import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Verifies an explicitly compiler-owned ordinary module without changing its authored source. */
export async function verifyNumberModuleProjection(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
): Promise<void> {
	const source =
		'function make(){const obj={item:{get value(){return document.title}}};if(Number("1"))return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;Math.abs(1);export const stable="safe";';
	const entry = path.join(root, 'entry.tsx');
	await writeFile(entry, source);
	for (const target of ['client', 'server'] as const) {
		const warnings = await buildDiagnosticFixture(
			adapter,
			root,
			target,
			false,
			true,
			false,
			workspace,
			entry
		);
		const files = await readdir(path.join(root, `out-${target}`));
		const file = files.find((name) => /^entry\.(?:js|mjs|cjs)$/.test(name));
		assert.ok(file, 'Missing target artifact');
		const artifact = path.join(root, `out-${target}`, file);
		const script = `import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
   const file=process.argv[1],target=process.argv[2],reads=[];
   if(target==='client')globalThis.document=Object.defineProperty({},'title',{get(){reads.push('title');return 'browser'}});
   const module=file.endsWith('.cjs')?createRequire(import.meta.url)(file):await import(pathToFileURL(file).href);
   console.log(JSON.stringify({namespace:{...module},reads}));`;
		const result = await promisify(execFile)(
			process.execPath,
			['--input-type=module', '-e', script, artifact, target],
			{ cwd: root }
		);
		assert.deepEqual(warnings, []);
		assert.deepEqual(
			JSON.parse(result.stdout),
			target === 'client'
				? { namespace: { stable: 'safe', value: 'browser' }, reads: ['title'] }
				: { namespace: { stable: 'safe' }, reads: [] }
		);
	}
}

/** Checks the original imported own-valueOf case under the same public ownership option. */
export async function verifyForeignNumberModuleProjection(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
): Promise<void> {
	const entry = path.join(root, 'entry.tsx');
	const helper = path.join(root, 'helper.js');
	await writeFile(
		entry,
		'import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";'
	);
	await writeFile(helper, 'export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};');
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				strict: true,
				skipLibCheck: true,
				allowJs: true,
				checkJs: false
			},
			files: ['entry.tsx']
		})
	);
	for (const target of ['client', 'server'] as const) {
		const warnings = await buildDiagnosticFixture(
			adapter,
			root,
			target,
			false,
			true,
			false,
			workspace,
			[entry, helper]
		);
		const files = await readdir(path.join(root, `out-${target}`));
		const file = files.find((name) => /^entry\.(?:js|mjs|cjs)$/.test(name));
		assert.ok(file, 'Missing target artifact');
		const artifact = path.join(root, `out-${target}`, file);
		const script = `import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
   const file=process.argv[1],target=process.argv[2],reads=[];
   const number=Object.getOwnPropertyDescriptor(globalThis,'Number');
   const document=Object.getOwnPropertyDescriptor(globalThis,'document');
   try{
    if(target==='client')globalThis.document=Object.defineProperty({},'title',{get(){reads.push('title');return 'browser'}});
    const module=file.endsWith('.cjs')?createRequire(import.meta.url)(file):await import(pathToFileURL(file).href);
    console.log(JSON.stringify({namespace:{...module},reads,numberReplaced:globalThis.Number!==number.value}));
   }finally{
    Object.defineProperty(globalThis,'Number',number);
    if(document)Object.defineProperty(globalThis,'document',document);else delete globalThis.document;
   }`;
		const result = await promisify(execFile)(
			process.execPath,
			['--input-type=module', '-e', script, artifact, target],
			{ cwd: root }
		);
		assert.deepEqual(warnings, []);
		assert.deepEqual(
			JSON.parse(result.stdout),
			target === 'client'
				? {
						namespace: { stable: 'safe', value: 'browser' },
						reads: ['title'],
						numberReplaced: true
					}
				: { namespace: { stable: 'safe' }, reads: [], numberReplaced: true }
		);
	}
}
