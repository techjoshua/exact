import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
	assertDiagnosticBuildWarnings,
	buildDiagnosticFixture
} from './compiler-diagnostic-build.js';

const execute = promisify(execFile);
const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** One coordinated definition shared by SDK and adapter paired-artifact checks. */
export const selectedModuleCoordinatedSource =
	"import {TaskContext,type Component} from '@exactjs/core';import {browserValue,serverValue} from 'selected-donor';export const client=browserValue,server=serverValue;export function View(this:Component<{value:string}>){this.state.value='ready';async function load(task:TaskContext=TaskContext.server()){return server;}return()=> <button onClick={async()=>{this.state.value=client+await load();}}>{this.state.value}</button>;}";

/** Distinct routed implementations. Wrong-route selection changes the observed export value. */
export const selectedModuleCoordinatedImplementations = {
	client:
		"export const browserValue=document.title+':browser-entry';export const serverValue=process.version+':browser-server';",
	server:
		"export const browserValue=document.title+':node-browser';export const serverValue=process.version+':node-entry';"
} as const;

/** Qualifies captured initialization using one package and each adapter's actual build hooks. */
export async function verifySelectedModulePartition(adapter: 'vite' | 'webpack' | 'bun') {
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/selected-module-partition-'));
	try {
		const entry = path.join(root, 'entry.tsx');
		const directory = path.join(root, 'node_modules/selected-donor');
		await mkdir(directory, { recursive: true });
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({
					name: '@fixture/selected-module-partition',
					type: 'module',
					private: true
				})
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						target: 'ES2022',
						jsx: 'preserve',
						jsxImportSource: '@exactjs/jsx',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						strict: true,
						types: [],
						lib: ['ES2022', 'DOM', 'ESNext.Disposable'],
						noEmit: true
					},
					files: ['entry.tsx']
				})
			),
			writeFile(entry, `import {read} from 'selected-donor';export const value=read();`),
			writeFile(path.join(directory, 'index.d.ts'), 'export declare function read():string;'),
			writeFile(
				path.join(directory, 'package.json'),
				JSON.stringify({
					name: 'selected-donor',
					type: 'module',
					exports: {
						'.': {
							types: './index.d.ts',
							'exact-client': './browser.js',
							'exact-server': './node.js',
							browser: './browser.js',
							node: './node.js',
							default: './default.js'
						}
					}
				})
			),
			writeFile(path.join(directory, 'default.js'), 'export function read(){return "default";}')
		]);
		const owned = [entry, ...['browser.js', 'node.js'].map((file) => path.join(directory, file))];
		for (const mixed of [false, true]) {
			await writeFile(
				path.join(directory, 'browser.js'),
				mixed
					? 'const eager=process.version;export function read(){return document.title+eager;}'
					: 'const eager=document.title;export function dormant(){return process.version;}export function read(){return eager;}'
			);
			await writeFile(
				path.join(directory, 'node.js'),
				mixed
					? 'const eager=document.title;export function read(){return process.version+eager;}'
					: 'const eager=process.version;export function dormant(){return document.title;}export function read(){return eager;}'
			);
			for (const target of ['client', 'server'] as const) {
				if (mixed) {
					await assert.rejects(
						() =>
							buildDiagnosticFixture(adapter, root, target, false, true, false, undefined, owned, [
								'selected-donor'
							]),
						/EXACT2101/
					);
					continue;
				}
				const warnings = await buildDiagnosticFixture(
					adapter,
					root,
					target,
					false,
					true,
					false,
					undefined,
					owned,
					['selected-donor']
				);
				await assertDiagnosticBuildWarnings(adapter, root, target, warnings);
				const output = path.join(
					root,
					`out-${target}`,
					adapter === 'webpack' ? 'entry.cjs' : 'entry.js'
				);
				const verifier = path.join(root, 'verify.mjs');
				await writeFile(
					verifier,
					`import assert from 'node:assert/strict';globalThis.document={title:'browser'};const imported=await import(${JSON.stringify(pathToFileURL(output).href)});const result=imported.default??imported;assert.equal(result.value,${target === 'client' ? "'browser'" : 'process.version'});console.log('selected module linked');`
				);
				const result = await execute(
					adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
					[verifier],
					{ cwd: root, timeout: 15000 }
				);
				assert.equal(result.stdout.trim(), 'selected module linked');
			}
		}
		// Both imports are legitimate inputs to the paired component. Each artifact
		// retains its own scalar declaration and the compiler's coordinated View.
		await writeFile(entry, selectedModuleCoordinatedSource);
		await writeFile(
			path.join(directory, 'index.d.ts'),
			'export declare const browserValue:string,serverValue:string;'
		);
		await writeFile(
			path.join(directory, 'browser.js'),
			selectedModuleCoordinatedImplementations.client
		);
		await writeFile(
			path.join(directory, 'node.js'),
			selectedModuleCoordinatedImplementations.server
		);
		for (const target of ['client', 'server'] as const) {
			const warnings = await buildDiagnosticFixture(
				adapter,
				root,
				target,
				false,
				true,
				false,
				undefined,
				owned,
				['selected-donor']
			);
			await assertDiagnosticBuildWarnings(adapter, root, target, warnings);
			const output = path.join(
				root,
				`out-${target}`,
				adapter === 'webpack' ? 'entry.cjs' : 'entry.js'
			);
			const verifier = path.join(root, 'verify.mjs');
			await writeFile(
				verifier,
				`import assert from 'node:assert/strict';globalThis.document={title:'browser'};const imported=await import(${JSON.stringify(pathToFileURL(output).href)});const result=imported.default??imported;assert.equal(typeof result.View,'function');assert.equal(result[${JSON.stringify(target === 'client' ? 'client' : 'server')}],${target === 'client' ? "'browser:browser-entry'" : "process.version+':node-entry'"});assert.equal(Object.hasOwn(result,${JSON.stringify(target === 'client' ? 'server' : 'client')}),false);console.log('coordinated module linked');`
			);
			const result = await execute(
				adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
				[verifier],
				{ cwd: root, timeout: 15000 }
			);
			assert.equal(result.stdout.trim(), 'coordinated module linked');
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
