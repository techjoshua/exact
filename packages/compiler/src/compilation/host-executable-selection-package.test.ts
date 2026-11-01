import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { appendFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { expect, it, onTestFinished, vi } from 'vitest';
import { ExactCompilerSession } from '../expression/project.js';
import type { NativeCompilerRequest } from '../native/process-contracts.js';
import { withExactHostExecutableSelection } from './host-executable-selection.js';

// Source bytes match the original context-alias case. Runtime selection is an
// explicit extra prerequisite, not a change to the standalone Session contract.
const source = `import{createContext as context}from '@exactjs/core';const Token=context('token',{scope:'request'});export function Page(this:{getContext(token:unknown):string}){const label=this.getContext(Token);return()=> <p>{label}</p>;}`;

it.each(['client', 'server'] as const)(
	'binds only nominated runtime package artifacts using the real %s resolver',
	async (target) => {
		const parent = path.resolve('.tmp');
		await mkdir(parent, { recursive: true });
		const root = await mkdtemp(path.join(parent, 'context-runtime-selection-'));
		onTestFinished(() => rm(root, { recursive: true, force: true }));
		const filename = path.join(root, 'entry.tsx');
		const configFile = path.join(root, 'tsconfig.json');
		await writeFile(
			configFile,
			JSON.stringify({
				compilerOptions: {
					module: 'ESNext',
					moduleResolution: 'Bundler',
					target: 'ES2022',
					jsx: 'preserve',
					allowJs: true,
					skipLibCheck: true,
					noEmit: true
				},
				files: ['entry.tsx']
			})
		);
		await writeFile(filename, source);
		if (process.env.EXACT_CONTEXT_SELECTION_CAPTURE)
			await writeFile(
				path.join(process.env.EXACT_CONTEXT_SELECTION_CAPTURE, target + '-config.json'),
				await readFile(configFile)
			);
		const server = await createServer({
			root,
			configFile: false,
			appType: 'custom',
			logLevel: 'silent',
			resolve: { preserveSymlinks: target === 'server' },
			server: { middlewareMode: true, watch: null },
			ssr: { noExternal: ['@exactjs/core'] },
			optimizeDeps: { noDiscovery: true, include: [] }
		});
		onTestFinished(() => server.close());
		const environment = target === 'client' ? server.environments.client : server.environments.ssr;
		const resolve = async (specifier: string, importer: string) => {
			const result = await environment.pluginContainer.resolveId(specifier, importer);
			return result ? { id: result.id, external: Boolean(result.external) } : undefined;
		};
		const entry = await resolve('@exactjs/core', filename);
		expect(entry?.external).toBe(false);
		expect(entry?.id).toMatch(
			target === 'client' ? /\/dist\/client\/index\.js$/ : /\/dist\/server\/index\.js$/
		);
		if (target === 'server') expect(entry!.id).toContain('/node_modules/@exactjs/core/');
		const runtime = await resolve('./keys.js', entry!.id);
		expect(runtime?.external).toBe(false);
		expect(runtime?.id).toMatch(
			target === 'client' ? /\/dist\/client\/keys\.js$/ : /\/dist\/server\/keys\.js$/
		);
		const session = new ExactCompilerSession();
		onTestFinished(() => session.dispose());
		let snapshots: NativeCompilerRequest[] = [];
		let activeMode = 'selected';
		const compile = session.compileNative.bind(session);
		vi.spyOn(session, 'compileNative').mockImplementation((request) => {
			if (process.env.EXACT_CONTEXT_SELECTION_CAPTURE)
				appendFileSync(
					path.join(process.env.EXACT_CONTEXT_SELECTION_CAPTURE, target + '-requests.jsonl'),
					JSON.stringify({ phase: 'before', request }) + '\n'
				);
			const response = compile(request);
			if (request.kind === 'compile' && process.env.EXACT_CONTEXT_SELECTION_CAPTURE)
				writeFileSync(
					path.join(process.env.EXACT_CONTEXT_SELECTION_CAPTURE, target + '-compile-response.json'),
					JSON.stringify(response)
				);
			if (process.env.EXACT_CONTEXT_SELECTION_CAPTURE)
				appendFileSync(
					path.join(process.env.EXACT_CONTEXT_SELECTION_CAPTURE, target + '-requests.jsonl'),
					JSON.stringify({
						phase: 'after',
						kind: request.kind,
						id: request.id,
						error: response.error
					}) + '\n'
				);
			if (request.kind === 'synchronize') {
				expect(response.error).toBeUndefined();
				expect(response.executableSelection?.revision).toBe(request.executableSelection?.revision);
				snapshots.push(request);
				if (activeMode === 'selected' && process.env.EXACT_CONTEXT_SELECTION_CAPTURE) {
					// Preserve the actual installation even if later semantic helper analysis refuses.
					writeFileSync(
						path.join(process.env.EXACT_CONTEXT_SELECTION_CAPTURE, target + '.json'),
						JSON.stringify({
							stage:
								request.executableSelection!.target === target
									? 'prepared-installation'
									: 'discovery-installation',
							snapshot: request,
							request: {
								kind: 'analyze',
								id: filename,
								source,
								root,
								configFile,
								target: request.executableSelection!.target
							},
							runtime: runtime!.id,
							runtimeSource: request.sources!.find((item) => item.id === runtime!.id)!.source
						})
					);
				}
			}
			return response;
		});
		for (const mode of ['selected', 'external', 'veto', 'missing-dependency', 'unnamed'] as const) {
			snapshots = [];
			activeMode = mode;
			await withExactHostExecutableSelection(
				session,
				() => ({
					filename,
					source,
					root,
					configFile,
					target,
					additionalSourceFiles:
						mode === 'unnamed'
							? []
							: mode === 'missing-dependency'
								? [entry!.id]
								: [entry!.id, runtime!.id],
					prepare(value, file) {
						return {
							source: value,
							prepared: undefined,
							privateSource: mode !== 'veto' || file !== runtime!.id
						};
					},
					resolve: async (specifier, importer) => {
						const result = await resolve(specifier, importer);
						return mode === 'external' && specifier === '@exactjs/core' && result
							? { ...result, external: true }
							: result;
					}
				}),
				() => {
					const snapshot = snapshots.at(-1)!;
					const edge = snapshot.executableSelection!.edges.find(
						(item) => item.importer === filename && item.specifier === '@exactjs/core'
					);
					if (mode === 'external' || mode === 'unnamed') expect(edge?.selected).toBeUndefined();
					else expect(edge?.selected).toBe(entry!.id);
					const keysEdge = snapshot.executableSelection!.edges.find(
						(item) => item.importer === entry!.id && item.specifier === './keys.js'
					);
					if (mode === 'selected') expect(keysEdge?.selected).toBe(runtime!.id);
					else expect(keysEdge?.selected).toBeUndefined();
					for (const module of snapshot.executableSelection!.modules) {
						const text = snapshot.sources!.find((item) => item.id === module.sourceId)!.source;
						expect(module.contentRevision).toBe(createHash('sha256').update(text).digest('hex'));
					}
					if (mode !== 'selected') return;
					const response = session.compileNative({
						kind: 'compile',
						id: filename,
						source,
						root,
						configFile,
						target
					});
					expect(response.error).toBeUndefined();
					// Acquisition is not factory policy or initializer-effect acceptance.
					// The ordinary semantic consumer must still reject emission on error.
					if (response.diagnostics.some((item) => item.severity === 'error'))
						expect(response.code ?? '').toBe('');
					if (process.env.EXACT_CONTEXT_SELECTION_CAPTURE) {
						return writeFile(
							path.join(process.env.EXACT_CONTEXT_SELECTION_CAPTURE, target + '.json'),
							JSON.stringify({
								snapshot,
								request: { kind: 'analyze', id: filename, source, root, configFile, target },
								runtime: runtime!.id,
								runtimeSource: snapshot.sources!.find((item) => item.id === runtime!.id)!.source
							})
						);
					}
				}
			);
		}
		// The installed artifact is the source selected by the host, never src/keys.ts.
		expect(await readFile(runtime!.id, 'utf8')).toContain('export function createContext');
	},
	60_000
);

it('uses helper negatives only for exact prepared bytes and retains ordinary import effects', async () => {
	const parent = path.resolve('.tmp');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, 'helper-discovery-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
	const compilerOptions = {
		module: 'ESNext',
		moduleResolution: 'Bundler',
		target: 'ES2022',
		allowJs: true,
		skipLibCheck: true
	};
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({ compilerOptions, files: ['effect.js'] })
	);
	await writeFile(path.join(root, 'effect.js'), "console.log('helper-discovery-effect');");
	await writeFile(
		path.join(root, 'helper.js'),
		'/** @param {{value:number}} s */ export function mutate(s){s.value=2}'
	);
	const server = await createServer({
		root,
		configFile: false,
		appType: 'custom',
		logLevel: 'silent',
		server: { middlewareMode: true, watch: null },
		optimizeDeps: { noDiscovery: true, include: [] }
	});
	onTestFinished(() => server.close());
	for (const test of [
		{ name: 'side-effect', source: `import './effect.js';export const value=1;`, semantic: false },
		{
			name: 'nested',
			source: `import {mutate} from './helper.js';export function outer(s:{value:number}){return ()=>mutate(s)}`,
			semantic: true
		},
		{
			name: 'alias',
			source: `import {mutate} from './helper.js';const alias=mutate;export function run(s:{value:number}){alias(s)}`,
			semantic: true
		},
		{
			name: 'unknown',
			source: `declare function externalWork():void;export function run(){externalWork()}`,
			semantic: true
		},
		{
			name: 'optional',
			source: `declare const externalWork:(()=>void)|undefined;export function run(){externalWork?.()}`,
			semantic: true
		},
		{ name: 'prepared-change', source: `export const value=1;`, semantic: true }
	]) {
		const filename = path.join(root, test.name + '.ts');
		await writeFile(filename, test.source);
		await writeFile(
			path.join(root, 'tsconfig.json'),
			JSON.stringify({ compilerOptions, files: [path.basename(filename)] })
		);
		const session = new ExactCompilerSession();
		onTestFinished(() => session.dispose());
		try {
			const requests: NativeCompilerRequest[] = [];
			const compile = session.compileNative.bind(session);
			vi.spyOn(session, 'compileNative').mockImplementation((request) => {
				requests.push(request);
				return compile(request);
			});
			let finalSource = test.source;
			await withExactHostExecutableSelection(
				session,
				() => ({
					filename,
					source: test.source,
					root,
					configFile: path.join(root, 'tsconfig.json'),
					target: 'client',
					prepare(value, file) {
						const source =
							test.name === 'prepared-change' && file === filename
								? value +
									'\ndeclare function externalWork():void;export function run(){externalWork()}'
								: value;
						if (file === filename) finalSource = source;
						return { source, prepared: undefined };
					},
					resolve: async (specifier, importer) => {
						const result = await server.environments.client.pluginContainer.resolveId(
							specifier,
							importer
						);
						return result ? { id: result.id, external: Boolean(result.external) } : undefined;
					}
				}),
				async () => {
					const helperRequests = requests.filter(
						(request) => request.kind === 'analyze' && request.id === filename
					);
					expect(helperRequests.length !== 0, test.name).toBe(test.semantic);
					if (test.name === 'prepared-change') {
						expect(helperRequests.every((request) => request.source === finalSource)).toBe(true);
						expect(
							requests
								.filter((request) => request.kind === 'executable-slots' && request.id === filename)
								.map((request) => request.source)
						).toEqual([test.source, finalSource]);
					}
					const response = session.compileNative({
						kind: test.name === 'side-effect' ? 'compile' : 'analyze',
						id: filename,
						source: finalSource,
						root,
						configFile: path.join(root, 'tsconfig.json'),
						target: 'client',
						preserveOrdinaryModules: true
					});
					expect(response.error).toBeUndefined();
					if (test.name === 'side-effect') {
						expect(requests.filter((request) => request.kind === 'analyze')).toEqual([]);
						expect(response.code).toContain('./effect.js');
						const output = path.join(root, 'emitted.mjs');
						await writeFile(output, response.code!);
						const runtime = spawnSync(
							process.execPath,
							[
								'--input-type=module',
								'-e',
								`import assert from 'node:assert/strict';const value=await import(process.argv[1]);assert.equal(value.value,1);`,
								pathToFileURL(output).href
							],
							{ encoding: 'utf8', timeout: 10_000 }
						);
						expect(runtime.status, runtime.stderr).toBe(0);
						expect(runtime.stdout.trim()).toBe('helper-discovery-effect');
					}
				}
			);
		} finally {
			session.dispose();
		}
	}
}, 60_000);
