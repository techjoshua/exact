import { createServer } from 'node:http';
import path from 'node:path';
import ts from 'typescript';
import { readFile, symlink } from 'node:fs/promises';
import { expect, it, onTestFinished, vi } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from '@exactjs/core';
import { composeExactExecutorContract } from '@exactjs/server';
import { createExactNodeHandler } from '@exactjs/node-adapter';
import { compileProjectArtifacts, compileFileArtifacts, createCompilerSession } from '../index.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import {
	createCompilerTestWorkspace,
	createBrowserTestWorkspace,
	repositoryPath,
	writeTestFiles
} from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { nativePatternSources } from '../test-support/native-pattern-sources.js';
import { mergeStateForContract, stateForContract } from '../../../hydrate/src/state.js';

const examples = [
	{
		name: 'async native Array push',
		nativeArray: true,
		helper: `export async function apply(state:{values:number[]}){await Promise.resolve();state.values.push(2);}`,
		body: 'await apply(this.state);return this.state.values.length;',
		value: 2,
		published: true
	},
	{
		name: 'native sparse pattern defaults',
		nativePattern: true,
		helper: nativePatternSources.reported,
		body: 'return apply(this.state.left);',
		value: '{"value":3,"values":[4],"trace":[]}',
		published: true
	},
	{
		name: 'native pattern without defaults',
		nativePattern: true,
		helper: nativePatternSources['pure-no-default'],
		body: 'return apply(this.state.left,[3,4]);',
		value: [3, 4],
		published: true
	},
	{
		name: 'JavaScript source',
		javascript: true,
		helper: `/** @param {{left:{value:string}}} state */ export function apply(state){state.left.value='after';return state.left.value;}`,
		body: 'return apply(this.state);',
		value: 'after',
		published: true
	},
	{
		name: 'sync finite transitive',
		helper: `import {assign} from './leaf.js';export function apply(state:{left:{value:string}}){assign(state.left,'after');return state.left;}`,
		leaf: `export function pure(value:string){return value;}export function assign(state:{value:string},value:string){state.value=pure(value);}`,
		body: 'const returned=apply(this.state);return returned.value;',
		value: 'after',
		published: true
	},
	{
		name: 'async raw alias',
		helper: `export async function apply(state:{left:{value:string}}){await Promise.resolve();state.left.value='after';return state.left;}`,
		body: 'const returned=await apply(this.state);return returned.value;',
		value: 'after',
		published: true
	},
	{
		name: 'equal performed',
		helper: `export function apply(state:{left:{value:string}}){state.left.value='before';return state.left.value;}`,
		body: 'return apply(this.state);',
		value: 'before',
		published: true
	},
	{
		name: 'skipped logical',
		helper: `export function apply(state:{left:{value:string}}){state.left.value ||= 'after';return state.left.value;}`,
		body: 'return apply(this.state);',
		value: 'before',
		published: false
	},
	{
		name: 'default arguments and ordinary identity',
		helper: `export function apply(state:{left:{value:string}},value=(state.left.value='after'),...rest:string[]){if(arguments.length!==1||arguments[0]!==state||rest.length!==0||apply!==original)throw new Error('changed invocation');return state.left.value;}const original=apply;export const identity={apply,name:apply.name,length:apply.length,prototype:apply.prototype};`,
		body: 'return apply(this.state);',
		value: 'after',
		published: true
	},
	{
		name: 'const scalar arrow',
		helper: `export const apply=(state:{left:{value:string}})=>{state.left.value='after';return state.left.value;};`,
		body: 'return apply(this.state);',
		value: 'after',
		published: true
	},
	{
		name: 'ordinary export shares module captures',
		helper: `let count=0;export function normal(){return ++count;}export function apply(state:{left:{value:string}}){state.left.value=String(normal());return state.left.value;}`,
		body: 'normal();return apply(this.state);',
		value: '2',
		published: true
	}
];

for (const lane of ['callable', 'lean'])
	for (const example of examples)
		it(`publishes source-owned helpers over HTTP: ${lane} ${example.name}`, async () => {
			const root = await createCompilerTestWorkspace('.exact-owned-helper-', process.cwd());
			const barrel = example.name === 'ordinary export shares module captures';
			const files = await writeTestFiles(root, {
				['javascript' in example && example.javascript ? 'helper.js' : 'helper.ts']: example.helper,
				...(example.leaf ? { 'leaf.ts': example.leaf } : {}),
				...(barrel ? { 'barrel.ts': "export {apply,normal} from './helper.js';" } : {}),
				'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';import {${'nativePattern' in example ? 'work as apply' : 'apply'}${example.name === 'ordinary export shares module captures' ? ',normal' : ''}} from '${barrel ? './barrel.js' : './helper.js'}';
 export function Page(this:Component<{values:number[];left:${'nativePattern' in example ? '{value:number;values:number[];trace:string[];sibling:string}' : '{value:string;sibling:string}'}}>){this.state.left=${'nativePattern' in example ? "{value:0,values:[],trace:[],sibling:'keep'}" : "{value:'before',sibling:'keep'}"};
 this.state.values=[0];async function save(task:TaskContext=TaskContext.server().blocking()){task.cleanup(()=>{void this.state.left.value;});${example.body}}
 ${lane === 'lean' ? 'save();return()=>this.state.left.value;' : 'return()=> <button onClick={()=>save()}>save</button>;'}}`
			});
			const artifacts = await compileProjectArtifacts([files['page.tsx']!], {
				rootDir: root,
				outDir: path.join(root, 'generated')
			});
			const page = artifacts.find((artifact) => artifact.inputFile === files['page.tsx'])!;
			const module = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
			const contract = composeExactExecutorContract([module.Page as AnyComponentFunction]);
			const operations = Object.values(contract.invocations);
			expect(operations).toHaveLength(1);
			const operation = operations[0]!;
			const reports: unknown[] = [];
			const server = createServer(
				createExactNodeHandler({
					contract,
					invocations: {},
					logger: {
						isEnabled: () => true,
						log: (report) => {
							reports.push(report);
						}
					}
				})
			);
			onTestFinished(async () => {
				server.closeAllConnections();
				if (server.listening)
					await new Promise<void>((resolve, reject) =>
						server.close((error) => (error ? reject(error) : resolve()))
					);
			});
			await new Promise<void>((resolve, reject) => {
				server.once('error', reject);
				server.listen(0, '127.0.0.1', resolve);
			});
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('No listener');
			const origin = `http://127.0.0.1:${address.port}`;
			const initial = {
				...('nativeArray' in example ? { values: [0] } : {}),
				left:
					'nativePattern' in example
						? { value: 0, values: [], trace: [], sibling: 'keep' }
						: { value: 'before', sibling: 'keep' }
			};
			const dependencies = operation.dependencies.map((dependency) =>
				dependency.path
					?.replace(/^this\.state\./, '')
					.split('.')
					.reduce<unknown>(
						(value, key) =>
							value && typeof value === 'object' ? Reflect.get(value, key) : undefined,
						initial
					)
			);
			for (const generation of [1, 2]) {
				const input = {
					type: 'invoke',
					id: operation.id,
					...(operation.stateWrites.some((write) => write.arrayRoots?.length)
						? { arrayCompletion: 4 as const }
						: {}),
					state: stateForContract(initial, { reads: operation.stateReads }),
					payload: { dependencies, generation }
				};
				const response = await fetch(origin + '/__exact', {
					method: 'POST',
					headers: { 'content-type': 'application/json', origin },
					body: JSON.stringify(
						encodeReactiveProtocolValue(
							generation === 1 ? input : { type: 'batch', operations: [input] }
						)
					),
					signal: AbortSignal.timeout(5000)
				});
				const bytes = await response.text();
				expect(response.status, JSON.stringify({ bytes, reports })).toBe(200);
				const decoded = decodeReactiveProtocolValue(JSON.parse(bytes)) as Record<string, unknown>;
				const result = (
					generation === 1 ? decoded : (decoded.results as Record<string, unknown>[])[0]
				)!;
				expect(result.ok).toBe(true);
				if (lane === 'callable')
					expect(result.value).toEqual(
						example.name === 'ordinary export shares module captures'
							? String(generation * 2)
							: example.value
					);
				expect(result.state).toEqual(
					'nativeArray' in example
						? undefined
						: 'nativePattern' in example
							? { left: { value: 3, values: { 0: 4 } } }
							: example.published
								? {
										left: {
											value:
												example.name === 'ordinary export shares module captures'
													? String(generation * 2)
													: example.value
										}
									}
								: undefined
				);
				if ('nativeArray' in example) {
					expect(result.arrayCompletion).toBe(4);
					expect(result.mutations).toMatchObject([{ operation: 'array-net', path: 'values' }]);
				}
				if ('nativePattern' in example) {
					expect(
						mergeStateForContract(initial, result.state, { writes: operation.stateWrites })
					).toEqual({
						ok: true,
						state: { left: { value: 3, values: [4], trace: [], sibling: 'keep' } }
					});
				}
			}
			expect(reports).toEqual([]);
		});

for (const route of ['project', 'single file'] as const) {
	it(`preserves semantic validation for both published helper targets (${route})`, async () => {
		const root = await createBrowserTestWorkspace('exact-helper-validation-');
		await symlink(repositoryPath('node_modules'), path.join(root, 'node_modules'), 'dir');
		const files = await writeTestFiles(root, {
			'package.json': '{"type":"module"}',
			'helper.ts': 'export function importedOptimistic(effects:string[]){effects.push("server");}',
			'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';import {importedOptimistic} from './helper.js';export const effects:string[]=[];export function Page(this:Component<{value:string}>){this.state.value='initial';async function load(task:TaskContext=TaskContext.server().latest()){importedOptimistic(effects);await Promise.resolve();this.state.value='complete';}return()=> <button onClick={()=>load()}>Load</button>;}`
		});
		const session = createCompilerSession({
			nativeCompiler: { executable: resolveNativeCompilerExecutable() }
		});
		const requests = vi.spyOn(session, 'compileNative');
		const outDir = path.join(root, 'out');
		const options = {
			session,
			rootDir: root,
			outDir,
			generatedValidation: 'semantic' as const,
			languageExtensions: false as const,
			packageEnhancements: []
		};
		try {
			const results =
				route === 'project'
					? await compileProjectArtifacts([files['page.tsx']!], options)
					: [await compileFileArtifacts(files['page.tsx']!, options)];
			const compiles = requests.mock.calls
				.map(([request]) => request)
				.filter((request) => request.kind === 'compile');
			for (const input of [files['page.tsx'], files['helper.ts']])
				expect(
					compiles
						.filter((request) => request.id === input)
						.map((request) => request.target)
						.sort()
				).toEqual(['client', 'server']);
			expect(compiles.every((request) => request.diagnostics === 'semantic')).toBe(true);
			for (const result of results) {
				expect(result.client.diagnostics).toEqual([]);
				expect(result.server.diagnostics).toEqual([]);
			}
			await expect(readFile(path.join(outDir, 'helper.exact.server.ts'), 'utf8')).resolves.not.toBe(
				''
			);
		} finally {
			requests.mockRestore();
			session.dispose();
		}
	});

	it(`rejects an unresolved generated helper provider before publication (${route})`, async () => {
		const root = await createBrowserTestWorkspace('exact-missing-helper-provider-');
		const files = await writeTestFiles(root, {
			'package.json': '{"type":"module"}',
			'entry.ts': 'const work=(a=0,b=(a=1))=>a;export const value=work();'
		});
		const session = createCompilerSession({
			nativeCompiler: { executable: resolveNativeCompilerExecutable() }
		});
		const requests = vi.spyOn(session, 'compileNative');
		const outDir = path.join(root, 'out');
		const options = {
			session,
			rootDir: root,
			outDir,
			generatedValidation: 'semantic' as const,
			languageExtensions: false as const,
			packageEnhancements: []
		};
		try {
			await expect(
				route === 'project'
					? compileProjectArtifacts([files['entry.ts']!], options)
					: compileFileArtifacts(files['entry.ts']!, options)
			).rejects.toThrow(/TS2307[\s\S]*@exactjs\/core/);
			const compiles = requests.mock.calls
				.map(([request]) => request)
				.filter((request) => request.kind === 'compile');
			expect(compiles.map((request) => request.target)).toEqual(['client', 'server']);
			expect(compiles.every((request) => request.diagnostics === 'semantic')).toBe(true);
			const server = requests.mock.calls.findIndex(
				([request]) => request.kind === 'compile' && request.target === 'server'
			);
			const actual = requests.mock.results[server];
			expect(actual?.type).toBe('return');
			if (actual?.type !== 'return') throw new Error('Missing generated semantic response');
			expect(actual.value.diagnostics).toEqual(
				expect.arrayContaining([expect.objectContaining({ code: 'TS2307', severity: 'error' })])
			);
			for (const target of ['client', 'server'])
				await expect(
					readFile(path.join(outDir, `entry.exact.${target}.ts`), 'utf8')
				).rejects.toMatchObject({ code: 'ENOENT' });
		} finally {
			requests.mockRestore();
			session.dispose();
		}
	});
}

it('rebases transitive inferred types in relocated mutation artifacts', async () => {
	const root = await createCompilerTestWorkspace('exact-transitive-artifact-types-', process.cwd());
	const files = await writeTestFiles(root, {
		'package.json': '{"type":"module"}',
		'model.ts': `export class Model { private brand!: void; value = 'before'; }`,
		'contracts.ts': `import {Model} from './model.js'; export interface State { model: Model; } export function makeModel(){return new Model();}`,
		'page.tsx': `import type {Component} from '@exactjs/core'; import {makeModel,type State} from './contracts.js'; export function Page(this:Component<State>){this.state.model=makeModel();this.state.model.value='after';return()=> <span>{this.state.model.value}</span>;}`
	});
	const artifacts = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'out'),
		generatedValidation: 'semantic',
		languageExtensions: false,
		packageEnhancements: []
	});
	const config = ts.getParsedCommandLineOfConfigFile(
		path.join(root, 'tsconfig.json'),
		{},
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
				throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
			}
		}
	);
	if (!config) throw new Error('Missing fixture configuration');
	for (const artifact of artifacts) {
		expect(artifact.client.diagnostics).toEqual([]);
		expect(artifact.server.diagnostics).toEqual([]);
	}
	const page = artifacts.find((artifact) => artifact.inputFile === files['page.tsx']);
	if (!page) throw new Error('Missing page artifact');
	const origins: string[] = [];
	for (const filename of [page.clientFile, page.serverFile]) {
		const source = ts.createSourceFile(
			filename,
			await readFile(filename, 'utf8'),
			ts.ScriptTarget.Latest,
			true
		);
		const visit = (node: ts.Node): void => {
			if (
				ts.isImportTypeNode(node) &&
				ts.isLiteralTypeNode(node.argument) &&
				ts.isStringLiteral(node.argument.literal)
			) {
				const specifier = node.argument.literal.text;
				origins.push(specifier);
				expect(
					ts.resolveModuleName(specifier, filename, config.options, ts.sys).resolvedModule
						?.resolvedFileName
				).toBe(files['model.ts']);
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	expect(origins).toContain('../model.js');
});
