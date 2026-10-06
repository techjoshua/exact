import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { rewriteModuleReferences } from './index.js';

const replacement = {
	sourceModule: 'original',
	sourceExport: 'value',
	targetModule: 'target',
	targetExport: 'next'
};

it('keeps local require calls and computed binding keys ordinary', () => {
	const source = `function run(require:(name:string)=>{value:number}){const {value}=require('original');return [value,require('original').value,require('original')['value']];}run;`;
	const result = rewriteModuleReferences(source, {
		filename: 'local.ts',
		moduleAliases: { original: 'aliased' },
		replacements: [replacement]
	});
	const code = ts.transpile(result.code, { target: ts.ScriptTarget.ESNext });
	const calls: string[] = [];
	const run = runInNewContext(code) as (loader: (name: string) => { value: number }) => number[];
	expect(Array.from(run((name) => (calls.push(name), { value: 7 })))).toEqual([7, 7, 7]);
	expect(calls).toEqual(['original', 'original', 'original']);
	const computed = rewriteModuleReferences(`const {['other']:value}=require('original');value;`, {
		replacements: [replacement]
	});
	expect(
		runInNewContext(computed.code, {
			require: (name: string) => (name === 'original' ? { other: 11 } : { next: 7 })
		})
	).toBe(11);
});

it('preserves optional loader and member short-circuiting for identifier and string target names', () => {
	for (const targetExport of ['next', 'next-value']) {
		for (const call of [`require('original')`, `require?.('original')`]) {
			for (const member of ['.value', '?.value', "['value']", "?.['value']"]) {
				const result = rewriteModuleReferences(`const value=${call}${member};value;`, {
					replacements: [{ ...replacement, targetExport }]
				});
				expect(
					runInNewContext(result.code, { require: () => ({ next: 7, 'next-value': 11 }) })
				).toBe(targetExport === 'next' ? 7 : 11);
				if (member.startsWith('?.'))
					expect(runInNewContext(result.code, { require: () => null })).toBeUndefined();
				else expect(() => runInNewContext(result.code, { require: () => null })).toThrow();
				if (call.includes('?.'))
					expect(runInNewContext(result.code, { require: undefined })).toBeUndefined();
			}
		}
	}
});

it('rewrites literal template requests and emits legal string-named module bindings', () => {
	for (const source of [
		'import {value} from "original";export {value};',
		'export {value} from "original";',
		'import * as original from "original";original.value;',
		'const {value}=require("original");value;',
		'require(`original`).value;'
	]) {
		const result = rewriteModuleReferences(source, {
			replacements: [{ ...replacement, targetExport: 'next-value' }]
		});
		expect(result.changed).toBe(true);
		const transpiled = ts.transpileModule(result.code, {
			reportDiagnostics: true,
			compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }
		});
		expect(transpiled.diagnostics).toEqual([]);
		if (!source.startsWith('import') && !source.startsWith('export'))
			expect(runInNewContext(result.code, { require: () => ({ 'next-value': 11 }) })).toBe(11);
	}
});

it('pairs native and ambient loaders with declared and imported ordinary bindings', () => {
	for (const source of [
		`function require(name:string){return {value:13};}require('original').value;`,
		`const require=(name:string)=>({value:13});require('original').value;`
	]) {
		const result = rewriteModuleReferences(source, {
			filename: 'declared.ts',
			moduleAliases: { original: 'aliased' },
			replacements: [replacement]
		});
		expect(result.changed).toBe(false);
		expect(runInNewContext(ts.transpile(result.code, { target: ts.ScriptTarget.ESNext }))).toBe(13);
	}
	const imported = `import require from 'callback';require('original').value;`;
	expect(rewriteModuleReferences(imported, { replacements: [replacement] }).changed).toBe(false);
	for (const source of [
		`declare function require(name:string):{value:number};require('original').value;`,
		`declare const require:(name:string)=>{value:number};require('original').value;`,
		`const {value}=require?.('original');value;`
	]) {
		const result = rewriteModuleReferences(source, {
			filename: 'ambient.ts',
			replacements: [replacement]
		});
		expect(result.changed).toBe(true);
		expect(
			runInNewContext(ts.transpile(result.code, { target: ts.ScriptTarget.ESNext }), {
				require: (name: string) => (name === 'target' ? { next: 7 } : { value: 3 })
			})
		).toBe(7);
	}
});
