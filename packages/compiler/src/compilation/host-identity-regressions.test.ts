import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { importArtifact } from '../test-support/import-artifact.js';

it('executes shadowed CommonJS callbacks without changing arguments or property keys', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const directory = path.resolve('.tmp/host-identity/commonjs');
	await mkdir(directory, { recursive: true });
	const source = `export function run(require: (name: string) => { value: number }) {
const direct = require("original").value;
const indexed = require("original")["value"];
const { value } = require("original");
return direct + indexed + value;
}`;
	const result = compiler.request({
		kind: 'compile',
		id: path.join(directory, 'source.ts'),
		source,
		moduleRewrite: {
			moduleAliases: { original: 'aliased' },
			replacements: [
				{
					sourceModule: 'original',
					sourceExport: 'value',
					targetModule: 'replacement',
					targetExport: 'next'
				}
			]
		}
	});
	expect(result.diagnostics).toEqual([]);
	const file = path.join(directory, 'compiled.ts');
	await writeFile(file, result.code!);
	const module = await importArtifact(file, path.join(directory, 'compiled.mjs'));
	const calls: string[] = [];
	const run = module.run as (loader: (name: string) => { value: number }) => number;
	expect(run((name) => (calls.push(name), { value: 7 }))).toBe(21);
	expect(calls).toEqual(['original', 'original', 'original']);
});

for (const target of ['client', 'server'] as const)
	it(`retains local renderer invocation and receipts in ${target} artifacts`, async () => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const directory = path.resolve('.tmp/host-identity/' + target);
		await mkdir(directory, { recursive: true });
		const moduleName = target === 'client' ? '@exactjs/dom' : '@exactjs/ssr';
		const renderer = target === 'client' ? 'render' : 'renderToString';
		const source = `import {${renderer}} from '${moduleName}';
import * as rendererNamespace from '${moduleName}';
function Page(){return ()=> <p>page</p>;}
export function direct(${renderer}: (value: unknown) => string){return ${renderer}(<Page/>);}
export function namespace(rendererNamespace: {${renderer}(value: unknown): string}){return rendererNamespace.${renderer}(<Page/>);}`;
		const result = compiler.request({
			kind: 'compile',
			target,
			id: path.join(directory, 'source.tsx'),
			source
		});
		expect(result.diagnostics).toEqual([]);
		const file = path.join(directory, 'compiled.ts');
		await writeFile(file, result.code!);
		const module = await importArtifact(file, path.join(directory, 'compiled.mjs'));
		const receipts: unknown[] = [];
		const callback = (value: unknown) => (receipts.push(value), 'ordinary');
		expect((module.direct as (rendererCallback: typeof callback) => string)(callback)).toBe(
			'ordinary'
		);
		expect(
			(module.namespace as (receiver: Record<string, typeof callback>) => string)({
				[renderer]: callback
			})
		).toBe('ordinary');
		expect(receipts).toHaveLength(2);
		expect(receipts.every((receipt) => receipt !== undefined)).toBe(true);
	});

it('keeps type-only classes out of runtime exports and symbol records', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const directory = path.resolve('.tmp/host-identity/exports');
	await mkdir(directory, { recursive: true });
	const id = path.join(directory, 'source.ts');
	const source =
		'class Hidden {} export type {Hidden}; export {type Hidden as Alias}; export type {Hidden as TypeAlias}; export {type Hidden as PerSpecifier}; export type Typed=number; export interface Shape {value:number} export const visible=1;';
	const response = compiler.request({ kind: 'analyze', id, source });
	expect(response.analysis.exports.map((value) => value.name)).toEqual(['visible']);
	expect(response.analysis.symbols.map((value) => value.exportName)).toEqual(['visible']);
	const types = response.analysis.semanticGraph.declarations.filter((value) =>
		['Typed', 'Shape'].includes(value.name)
	);
	expect(types).toHaveLength(2);
	expect(types.every((value) => value.typeOnly)).toBe(true);
	const references = response.analysis.semanticGraph.references.filter((value) =>
		['TypeAlias', 'PerSpecifier'].includes(value.exportedName ?? '')
	);
	expect(references).toHaveLength(2);
	expect(references.every((value) => value.typeOnly)).toBe(true);
	for (const target of ['client', 'server'] as const) {
		const compiled = compiler.request({ kind: 'compile', target, id, source });
		expect(compiled.diagnostics).toEqual([]);
		const file = path.join(directory, target + '.ts');
		await writeFile(file, compiled.code!);
		const emitted = await importArtifact(file, path.join(directory, target + '.mjs'));
		expect(Object.keys(emitted)).toEqual(['visible']);
		expect(emitted.visible).toBe(1);
	}
});

it('reuses a synchronized generation with one empty source', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const directory = path.resolve('.tmp/host-identity/synchronize');
	await mkdir(directory, { recursive: true });
	const configFile = path.join(directory, 'tsconfig.json');
	await writeFile(configFile, JSON.stringify({ files: ['empty.ts'] }));
	const id = path.join(directory, 'empty.ts');
	compiler.request({
		kind: 'synchronize',
		root: directory,
		configFile,
		sources: [{ id, source: '' }]
	});
	const response = compiler.request({
		kind: 'compile',
		root: directory,
		configFile,
		id,
		source: ''
	});
	expect(response.diagnostics).toEqual([]);
	expect(response.cacheHit).toBe(true);
	compiler.request({ kind: 'reset' });
	const fresh = compiler.request({ kind: 'compile', root: directory, configFile, id, source: '' });
	expect(fresh.cacheHit ?? false).toBe(false);
	expect(fresh.code).toBe(response.code);
});

it('executes replacements with string export names and preserves computed binding keys', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const directory = path.resolve('.tmp/host-identity/replacements');
	await mkdir(directory, { recursive: true });
	await writeFile(
		path.join(directory, 'original.mjs'),
		'export const value=3;export const other=11;'
	);
	await writeFile(
		path.join(directory, 'target.mjs'),
		'const next=7;export {next as "next-value"};'
	);
	const source = `import {value as named} from './original.mjs';
import * as original from './original.mjs';
export {value as forwarded} from './original.mjs';
const {value:bound}=require('./original.mjs');
const {['other']:untouched}=require('./original.mjs');
export const values=[named,original.value,bound,require(\`./original.mjs\`).value,untouched];`;
	const result = compiler.request({
		kind: 'compile',
		id: path.join(directory, 'source.ts'),
		source,
		moduleRewrite: {
			moduleAliases: {},
			replacements: [
				{
					sourceModule: './original.mjs',
					sourceExport: 'value',
					targetModule: './target.mjs',
					targetExport: 'next-value'
				}
			]
		}
	});
	expect(result.diagnostics).toEqual([]);
	const file = path.join(directory, 'compiled.ts');
	await writeFile(file, result.code!);
	const module = await importArtifact(file, path.join(directory, 'compiled.mjs'));
	expect(module.forwarded).toBe(7);
	expect(module.values).toEqual([7, 7, 7, 7, 11]);
});

it('checks virtual dependency type changes without losing prepared modules', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const directory = path.resolve('.tmp/host-identity/virtual-dependency');
	await mkdir(directory, { recursive: true });
	const configFile = path.join(directory, 'tsconfig.json');
	await writeFile(
		configFile,
		JSON.stringify({
			compilerOptions: { strict: true, moduleResolution: 'bundler', module: 'esnext' },
			files: ['generated/entry.ts']
		})
	);
	const id = path.join(directory, 'generated/entry.ts');
	const dependency = path.join(directory, 'generated/dependency.ts');
	const source = 'import {value} from "./dependency.js";export const result:number=value;';
	for (const value of ['7', '"invalid"', '9']) {
		compiler.request({
			kind: 'synchronize',
			root: directory,
			configFile,
			sources: [
				{ id: dependency, source: 'export const value=' + value + ';' },
				{ id, source }
			]
		});
		for (const target of ['client', 'server'] as const) {
			const result = compiler.request({
				kind: 'compile',
				target,
				root: directory,
				configFile,
				id,
				source,
				diagnostics: 'semantic'
			});
			expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'TS2307')).toBe(false);
			expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'TS2322')).toBe(
				value === '"invalid"'
			);
		}
	}
});

it('keeps Unicode capability locations on the authored call across prepared generations', () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	for (const marker of ['plain', '€', '😀'])
		for (const separator of ['', '\n', '\r\n', '\r', '\u2028', '\u2029']) {
			const source = `import {unsafeHtml} from '@exactjs/core';const marker="${marker}";${separator}export const html=unsafeHtml('safe');`;
			const response = compiler.request({
				kind: 'analyze',
				id: path.resolve('.tmp/host-identity/unicode-capability.ts'),
				packageType: 'application',
				source
			});
			const start = source.lastIndexOf('unsafeHtml');
			const diagnostic = response.diagnostics.find((value) => value.code === 'EXACT4001')!;
			expect(diagnostic.start).toBe(start);
			expect(source.slice(diagnostic.start!, diagnostic.start! + diagnostic.length!)).toBe(
				'unsafeHtml'
			);
			const capability = response.analysis.requiredCapabilities.rawHtml[0]!;
			expect(capability.line).toBe(separator ? 2 : 1);
			const prefix = source
				.slice(0, start)
				.split(/\r\n|[\r\n\u2028\u2029]/)
				.at(-1)!;
			expect(capability.column).toBe(Array.from(prefix).length + 1);
		}
});

it('preserves optional member access when replacing CommonJS exports', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const directory = path.resolve('.tmp/host-identity/optional-replacements');
	await mkdir(directory, { recursive: true });
	await writeFile(path.join(directory, 'original.cjs'), 'module.exports={value:3};');
	await writeFile(path.join(directory, 'empty.cjs'), 'module.exports=null;');
	await writeFile(path.join(directory, 'value.cjs'), 'module.exports={next:7,"next-value":11};');
	for (const [index, targetExport] of ['next', 'next-value'].entries()) {
		for (const targetModule of ['./empty.cjs', './value.cjs']) {
			const source = `export const values=[require('./original.cjs')?.value,require('./original.cjs')?.['value']];
export function shadow(require:(name:string)=>{value:number}|null){return require('./original.cjs')?.value;}`;
			const result = compiler.request({
				kind: 'compile',
				id: path.join(directory, 'source.ts'),
				source,
				moduleRewrite: {
					moduleAliases: {},
					replacements: [
						{ sourceModule: './original.cjs', sourceExport: 'value', targetModule, targetExport }
					]
				}
			});
			expect(result.diagnostics).toEqual([]);
			const basename = `${index}-${targetModule.includes('empty') ? 'empty' : 'value'}`;
			const file = path.join(directory, basename + '.ts');
			await writeFile(file, result.code!);
			const emitted = await importArtifact(file, path.join(directory, basename + '.mjs'));
			const expected = targetModule.includes('empty') ? undefined : index === 0 ? 7 : 11;
			expect(emitted.values).toEqual([expected, expected]);
			const shadow = emitted.shadow as (
				loader: (name: string) => { value: number } | null
			) => number | undefined;
			expect(shadow(() => null)).toBeUndefined();
			const calls: string[] = [];
			expect(shadow((name) => (calls.push(name), { value: 13 }))).toBe(13);
			expect(calls).toEqual(['./original.cjs']);
			const optionalCall = compiler.request({
				kind: 'compile',
				id: path.join(directory, 'optional.ts'),
				source: `const result=require?.('./original.cjs')?.value;`,
				moduleRewrite: {
					moduleAliases: {},
					replacements: [
						{ sourceModule: './original.cjs', sourceExport: 'value', targetModule, targetExport }
					]
				}
			});
			expect(optionalCall.diagnostics).toEqual([]);
			const context = { require: undefined };
			expect(runInNewContext(optionalCall.code! + '\nresult;', context)).toBeUndefined();
			expect(
				runInNewContext(optionalCall.code! + '\nresult;', { require: () => null })
			).toBeUndefined();
			expect(
				runInNewContext(optionalCall.code! + '\nresult;', {
					require: () => ({ next: 7, 'next-value': 11 })
				})
			).toBe(index === 0 ? 7 : 11);
		}
	}
});
