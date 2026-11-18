import { withExactHostExecutableSelection } from './host-executable-selection.js';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { expect, it, onTestFinished, vi } from 'vitest';
import { ExactCompilerSession } from '../expression/project.js';
import type { NativeExecutableSelection } from '../native/process-executable-selection.js';
import {
	createCompilerTestWorkspace,
	createTestWorkspace,
	writeTestFiles
} from '../test-support/workspace.js';
import { synchronizeNativeProject } from './project-synchronization.js';

it('keeps authored types while selected effects and session lifecycle cross the native boundary', async () => {
	const directory = await createCompilerTestWorkspace(
		'.exact-executable-selection-',
		process.cwd()
	);
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	const files = new Map([
		[
			'entry.ts',
			`import {apply,answer} from './helper.js';export const n:number=answer();export function run(s:{a:number,b:number}){apply(s);}import type {Component} from '@exactjs/core';export function Page(this:Component<{a:number,b:number}>){this.state.a=0;this.state.b=0;run(this.state);return()=>this.state.b;}`
		],
		[
			'helper.ts',
			`export function apply(s:{a:number,b:number}){s.a=2;}export function answer():number{return 2;}`
		],
		['helper.js', `export function apply(s){s.b=99;}export function answer(){return 'host';}`]
	]);
	await Promise.all([
		writeFile(path.join(directory, 'package.json'), '{"type":"module"}'),
		writeFile(
			path.join(directory, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					strict: true,
					module: 'ESNext',
					moduleResolution: 'Bundler',
					target: 'ES2022',
					skipLibCheck: true
				},
				files: ['entry.ts']
			})
		),
		...[...files].map(([name, source]) => writeFile(path.join(directory, name), source))
	]);
	const sources = new Map([...files].map(([name, source]) => [path.join(directory, name), source]));
	const snapshot: NativeExecutableSelection = {
		generation: 1,
		revision: 'internal-test',
		target: 'default',
		modules: [...sources].map(([sourceId, source]) => ({
			id: sourceId,
			sourceId,
			contentRevision: createHash('sha256').update(source).digest('hex')
		})),
		edges: [
			{
				importer: path.join(directory, 'entry.ts'),
				slot: 0,
				specifier: './helper.js',
				kind: 'import',
				selected: path.join(directory, 'helper.js')
			}
		]
	};
	const options = { root: directory, configFile: path.join(directory, 'tsconfig.json'), session };
	await synchronizeNativeProject(
		[...sources.keys()],
		{ ...options, executableSelection: snapshot },
		sources
	);
	const request = {
		kind: 'analyze' as const,
		id: path.join(directory, 'entry.ts'),
		source: files.get('entry.ts')!,
		root: directory,
		configFile: options.configFile,
		diagnostics: 'semantic' as const
	};
	const selected = session.compileNative(request);
	expect(selected.error).toBeUndefined();
	expect(selected.diagnostics).toEqual([]);
	expect(selected.analysis.callables.find((value) => value.name === 'run')?.stateWrites).toEqual([
		expect.objectContaining({ path: 'b' })
	]);
	// Native Node verifies the ordinary executable body independently of compiler summaries.
	const ordinary = spawnSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`import {apply,answer} from ${JSON.stringify(pathToFileURL(path.join(directory, 'helper.js')).href)};const state={a:0,b:0};apply(state);console.log(JSON.stringify([answer(),state]));`
		],
		{ encoding: 'utf8' }
	);
	expect(ordinary.status, ordinary.stderr).toBe(0);
	expect(JSON.parse(ordinary.stdout)).toEqual(['host', { a: 0, b: 99 }]);
	// Rebind the edited entry before checking types against the same selected body.
	const editedRequest = { ...request, source: request.source.replace('n:number', 'n:string') };
	const editedSources = new Map(sources).set(request.id, editedRequest.source);
	await synchronizeNativeProject(
		[...editedSources.keys()],
		{
			...options,
			executableSelection: {
				...snapshot,
				generation: 2,
				revision: 'edited-typing',
				modules: [...editedSources].map(([sourceId, text]) => ({
					id: sourceId,
					sourceId,
					contentRevision: createHash('sha256').update(text).digest('hex')
				}))
			}
		},
		editedSources
	);
	expect(session.compileNative(editedRequest).diagnostics).toContainEqual(
		expect.objectContaining({ code: 'TS2322', severity: 'error' })
	);
	await synchronizeNativeProject(
		[...sources.keys()],
		{
			...options,
			executableSelection: { ...snapshot, generation: 3, revision: 'restored-typing' }
		},
		sources
	);
	expect(session.compileNative({ ...request, kind: 'compile' }).diagnostics).toEqual([]);
	expect(() => session.compileNative({ ...request, target: 'server' })).toThrow(
		'executable selection target does not match request'
	);
	session.clear();
	const cleared = session.compileNative(request);
	expect(cleared.diagnostics).toEqual([]);
	expect(cleared.analysis.callables.find((value) => value.name === 'run')?.stateWrites).toEqual([
		expect.objectContaining({ path: 'a' })
	]);
	session.dispose();
	expect(() => session.compileNative(request)).toThrow('disposed');
});

it.each([
	['stable', 'function apply(s){s.b=2;}module.exports={apply};', true],
	[
		'cache property',
		'function apply(s){s.a=1;}function other(s){s.b=2;}module.exports={apply};require.cache[__filename].exports.apply=other;',
		false
	],
	[
		'cache replacement',
		'function apply(s){s.a=1;}function other(s){s.b=2;}module.exports={apply};require.cache[__filename].exports={apply:other};',
		false
	],
	[
		'cached module alias',
		'function apply(s){s.a=1;}function other(s){s.b=2;}module.exports={apply};const current=require.cache[__filename];current.exports.apply=other;',
		false
	]
])('keeps CJS %s execution separate from unproven write authority', async (_name, body, exact) => {
	const directory = await createTestWorkspace('.exact-export-ownership-', process.cwd());
	const source = `import {TaskContext,type Component} from '@exactjs/core';import {apply} from './helper.cjs';export function run(s:{a:number,b:number}){apply(s);}export function Page(this:Component<{a:number,b:number}>){this.state.a=0;this.state.b=0;function save(task:TaskContext=TaskContext.server().blocking()){apply(this.state);}save();return()=>this.state.b;}`;
	const files = new Map([
		['entry.ts', source],
		['helper.cts', 'export function apply(s:{a:number,b:number}){s.a=0;}'],
		['helper.cjs', body]
	]);
	await writeTestFiles(directory, {
		...Object.fromEntries(files),
		'package.json': '{"type":"module"}',
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				strict: true,
				allowJs: true,
				checkJs: false,
				module: 'ESNext',
				moduleResolution: 'Bundler',
				target: 'ES2022',
				skipLibCheck: true
			},
			files: ['entry.ts']
		})
	});
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	const sources = new Map([...files].map(([name, text]) => [path.join(directory, name), text]));
	await synchronizeNativeProject(
		[...sources.keys()],
		{
			root: directory,
			configFile: path.join(directory, 'tsconfig.json'),
			session,
			executableSelection: {
				generation: 1,
				revision: 'export-ownership',
				target: 'default',
				modules: [...sources].map(([sourceId, text]) => ({
					id: sourceId,
					sourceId,
					contentRevision: createHash('sha256').update(text).digest('hex')
				})),
				edges: [
					{
						importer: path.join(directory, 'entry.ts'),
						slot: 1,
						specifier: './helper.cjs',
						kind: 'import',
						selected: path.join(directory, 'helper.cjs')
					}
				]
			}
		},
		sources
	);
	const response = session.compileNative({
		kind: 'analyze',
		id: path.join(directory, 'entry.ts'),
		source,
		root: directory,
		configFile: path.join(directory, 'tsconfig.json'),
		diagnostics: 'semantic'
	});
	expect(response.diagnostics).toEqual([]);
	const run = response.analysis.callables.find((value) => value.name === 'run')!;
	expect(run.effect).toBe(exact ? 'neutral' : 'unknown');
	expect(run.stateWrites.map((write) => write.path)).toEqual(exact ? ['b'] : []);
	expect(response.analysis.continuations.length).toBeGreaterThan(0);
	for (const continuation of response.analysis.continuations)
		expect(continuation.effects.stateWrites.map((write) => write.path)).toEqual(exact ? ['b'] : []);
	for (const mode of ['module', 'commonjs']) {
		const selected =
			mode === 'module'
				? `await import(${JSON.stringify(pathToFileURL(path.join(directory, 'helper.cjs')).href)})`
				: `require(${JSON.stringify(path.join(directory, 'helper.cjs'))})`;
		const ordinary = spawnSync(
			process.execPath,
			[
				'--input-type=' + mode,
				'-e',
				`const {apply}=${selected};const state={a:0,b:0};apply(state);console.log(JSON.stringify(state));`
			],
			{ encoding: 'utf8' }
		);
		expect(ordinary.status, ordinary.stderr).toBe(0);
		expect(JSON.parse(ordinary.stdout)).toEqual({ a: 0, b: 2 });
	}
});

it('executes eager getters only in available module targets', async () => {
	const directory = await createCompilerTestWorkspace('.exact-eager-export-', process.cwd());
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	for (const [name, definition, expression, browser] of [
		[
			'returned',
			'function make(){return {get value(){return document.title}}}',
			'make().value',
			true
		],
		[
			'parameter',
			'function read(input={value:""}){return input.value}',
			'read({get value(){return document.title}})',
			true
		],
		[
			'default',
			'function read(input={get value(){return document.title}}){return input.value}',
			'read()',
			true
		],
		['neutral', 'function make(){return {get value(){return "host"}}}', 'make().value', false]
	] as const) {
		const source = definition + `;export const value=${expression};export const stable="safe";`;
		for (const target of ['client', 'server'] as const) {
			const compiled = session.compileNative({
				kind: 'compile',
				id: path.join(directory, name + '.ts'),
				source,
				target,
				diagnostics: 'semantic'
			});
			expect(compiled.diagnostics).toEqual([]);
			const filename = path.join(directory, name + '-' + target + '.mjs');
			await writeFile(filename, compiled.code!);
			const browserGlobal = target === 'client' ? 'globalThis.document={title:"browser"};' : '';
			const result = spawnSync(
				process.execPath,
				[
					'--input-type=module',
					'-e',
					browserGlobal +
						`const value=await import(${JSON.stringify(pathToFileURL(filename).href)});console.log(JSON.stringify(value));`
				],
				{ encoding: 'utf8' }
			);
			expect(result.status, result.stderr).toBe(0);
			const exports = JSON.parse(result.stdout);
			expect(exports.stable).toBe('safe');
			if (target === 'server' && browser) expect(exports).not.toHaveProperty('value');
			else expect(exports.value).toBe(browser ? 'browser' : 'host');
		}
	}
});

it('keeps prepared projection transactions queued through failure and target changes', async () => {
	const root = await createCompilerTestWorkspace('.exact-host-target-queue-', process.cwd());
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	const filename = path.join(root, 'entry.ts');
	const source = 'export function answer(){return 7;}';
	await writeTestFiles(root, { 'entry.ts': source, 'package.json': '{"type":"module"}' });
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	const events: string[] = [];
	const run = (target: 'client' | 'server', mismatch = false) =>
		withExactHostExecutableSelection(
			session,
			() => ({
				filename,
				source,
				root,
				target,
				prepare(value, _filename, preparedTarget) {
					const final = value + '\n// prepared execution source\n';
					return { source: final, prepared: { source: final, target: preparedTarget } };
				},
				resolve: async () => undefined
			}),
			async (selectedTarget, prepared) => {
				events.push(selectedTarget);
				await Promise.resolve();
				if (!prepared || prepared.target !== selectedTarget)
					throw new Error('Prepared target handoff lost');
				const response = session.compileNative({
					kind: 'compile',
					id: filename,
					source: prepared.source,
					root,
					target: mismatch ? 'server' : selectedTarget,
					diagnostics: 'semantic'
				});
				return {
					target: selectedTarget,
					hash: createHash('sha256').update(prepared.source).digest('hex'),
					diagnostics: response.diagnostics,
					code: response.code
				};
			}
		);
	const results = await Promise.allSettled([run('client', true), run('server')]);
	const final = await run('client');
	if (process.env.EXACT_CHILD_INPUT_OBSERVATIONS)
		await appendFile(
			process.env.EXACT_CHILD_INPUT_OBSERVATIONS,
			JSON.stringify({
				case: 'host-target-queue',
				events,
				results: results.map((value) =>
					value.status === 'rejected'
						? { status: value.status, error: String(value.reason) }
						: value
				),
				final
			}) + '\n'
		);
	expect(results[0].status).toBe('rejected');
	if (results[0].status === 'rejected')
		expect(String(results[0].reason)).toContain(
			'executable selection target does not match request'
		);
	expect(results[1].status).toBe('fulfilled');
	if (results[1].status === 'fulfilled') {
		expect(results[1].value.target).toBe('server');
		expect(results[1].value.diagnostics).toEqual([]);
		expect(results[1].value.code).toContain('return 7');
		expect(results[1].value.hash).toBe(final.hash);
	}
	expect(final.target).toBe('client');
	expect(final.diagnostics).toEqual([]);
	expect(events).toEqual(['client', 'server', 'client']);
});

it('admits only named sibling sources and replaces their authority with each queued acquisition', async () => {
	const root = await createCompilerTestWorkspace('.exact-named-source-', process.cwd());
	await writeTestFiles(root, { 'package.json': '{"type":"module"}' });
	const app = path.join(root, 'app');
	const sibling = path.join(root, 'sibling');
	await mkdir(app);
	await mkdir(sibling);
	const filename = path.join(app, 'entry.ts');
	const helper = path.join(sibling, 'helper.js');
	const neighbor = path.join(sibling, 'neighbor.js');
	const source = `import {apply} from '../sibling/helper.js';import {other} from '../sibling/neighbor.js';export function run(s:{a:number,b:number}){apply(s);}export function opaque(){return other();}import type {Component} from '@exactjs/core';export function Page(this:Component<{a:number,b:number}>){this.state.a=0;this.state.b=0;run(this.state);return()=>this.state.b;}`;
	await writeFile(filename, source);
	await writeFile(
		path.join(sibling, 'helper.ts'),
		'export function apply(s:{a:number,b:number}){s.a=1;}'
	);
	await writeFile(
		helper,
		'/** @param {{a:number,b:number}} s */ export function apply(s){s.b=99;}'
	);
	await writeFile(path.join(sibling, 'neighbor.ts'), 'export function other(){return 1;}');
	await writeFile(neighbor, 'export function other(){return document.title;}');
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	const snapshots: NativeExecutableSelection[] = [];
	const acknowledgements: unknown[] = [];
	const compileNative = session.compileNative.bind(session);
	vi.spyOn(session, 'compileNative').mockImplementation((request) => {
		const response = compileNative(request);
		if (request.kind === 'synchronize' && request.executableSelection) {
			snapshots.push(request.executableSelection);
			acknowledgements.push(response.executableSelection);
			expect(response.executableSelection).toEqual(
				expect.objectContaining({
					generation: request.executableSelection.generation,
					revision: request.executableSelection.revision,
					target: request.executableSelection.target
				})
			);
		}
		return response;
	});
	const run = (target: 'client' | 'server', included: boolean, suffix = '') =>
		withExactHostExecutableSelection(
			session,
			() => ({
				filename,
				source,
				root: app,
				sourceRoot: app,
				target,
				additionalSourceFiles: included ? [helper] : [],
				prepare(value) {
					return { source: value + suffix, prepared: value + suffix };
				},
				resolve: async (specifier, importer) => ({
					id: path.resolve(path.dirname(importer), specifier)
				})
			}),
			(selectedTarget, prepared) => {
				const response = session.compileNative({
					kind: 'compile',
					id: filename,
					source: prepared!,
					root: app,
					target: selectedTarget,
					diagnostics: 'semantic'
				});
				expect(response.error).toBeUndefined();
				if (included) {
					expect(response.diagnostics).toEqual([]);
					expect(response.code).toBeTruthy();
				} else {
					expect(response.diagnostics).toContainEqual(
						expect.objectContaining({ code: 'EXACT2001', severity: 'error' })
					);
					expect(response.code ?? '').toBe('');
					expect(response.sourceMap).toBeUndefined();
				}
				return response;
			}
		);
	const first = await run('client', true);
	expect(first.analysis.callables.find((value) => value.name === 'run')?.stateWrites).toEqual([
		expect.objectContaining({ path: 'b' })
	]);
	const [revoked, restored] = await Promise.all([
		run('server', false),
		run('server', true, '\n// current prepared bytes')
	]);
	expect(
		revoked.analysis.callables.find((value) => value.name === 'run')?.stateWrites
	).not.toContainEqual(expect.objectContaining({ path: 'b' }));
	expect(restored.analysis.callables.find((value) => value.name === 'run')?.stateWrites).toEqual([
		expect.objectContaining({ path: 'b' })
	]);
	const selected = snapshots.at(-1)!;
	expect(selected.edges.find((edge) => edge.specifier.endsWith('helper.js'))?.selected).toBe(
		helper
	);
	expect(
		selected.edges.find((edge) => edge.specifier.endsWith('neighbor.js'))?.selected
	).toBeUndefined();
	expect(selected.modules.find((module) => module.id === helper)?.contentRevision).toBe(
		createHash('sha256')
			.update(
				'/** @param {{a:number,b:number}} s */ export function apply(s){s.b=99;}\n// current prepared bytes'
			)
			.digest('hex')
	);
	expect(
		snapshots.find(
			(snapshot) =>
				snapshot.target === 'server' && !snapshot.edges.some((edge) => edge.selected === helper)
		)
	).toBeDefined();
	expect(acknowledgements).toHaveLength(6);
	expect(selected.generation).toBeGreaterThan(snapshots[0]!.generation);
	if (process.env.EXACT_CHILD_INPUT_OBSERVATIONS)
		await appendFile(
			process.env.EXACT_CHILD_INPUT_OBSERVATIONS,
			JSON.stringify({
				case: 'named-source-admission',
				snapshots,
				acknowledgements,
				writes: [first, revoked, restored].map(
					(response) =>
						response.analysis.callables.find((value) => value.name === 'run')?.stateWrites
				)
			}) + '\n'
		);
});
