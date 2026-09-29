import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';

const patterns = [
	[
		'object alias and rest',
		'const {values:rows,...other}={values:[...props.values],count:props.values.length};',
		'rows.length+other.count'
	],
	[
		'array default and rest',
		'const [first,second=first,...rest]=props.values;',
		'first+second+rest.length'
	],
	[
		'nested default dependency',
		'const {nested:{value=props.fallback},copy=value}:{nested:{value?:number};copy?:number}={nested:props.optional,copy:undefined};',
		'value+copy'
	],
	['computed property', 'const {[props.key]:selected}=props.record;', 'selected'],
	['prototype-sensitive name', 'const {value:__proto__}={value:props.fallback};', '__proto__'],
	[
		'typed destructuring',
		'const {rows}:{rows:readonly number[]}={rows:props.values.slice()};',
		'rows.length'
	]
] as const;

it.each(patterns)(
	'preserves %s across checking and both executable targets',
	(name, declaration, value) => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const id = path.resolve('.tmp/destructured-' + name.replaceAll(' ', '-') + '.tsx');
		const source = `export function Probe(props:{values:number[];optional:{value?:number};fallback:number;key:string;record:Record<string,number>}){${declaration} const total=${value};return ()=> <p>{total.toFixed(0)}</p>;}`;
		for (const target of ['default', 'client', 'server'] as const) {
			const result = compiler.request({
				kind: target === 'default' ? 'check' : 'compile',
				id,
				source,
				root: process.cwd(),
				target,
				diagnostics: 'semantic'
			});
			expect(result.error).toBeUndefined();
			expect(result.diagnostics).toEqual([]);
		}
		const invalid = source.replace('total.toFixed(0)', 'total.missing');
		const result = compiler.request({
			kind: 'check',
			id,
			source: invalid,
			root: process.cwd(),
			target: 'default',
			diagnostics: 'semantic'
		});
		const diagnostics = result.diagnostics.filter((d) => d.code === 'TS2339');
		expect(diagnostics.length).toBeGreaterThan(0);
		for (const diagnostic of diagnostics)
			expect(invalid.slice(diagnostic.start!, diagnostic.start! + diagnostic.length!)).toContain(
				'missing'
			);
	}
);

it('rejects effectful defaults with an operation-specific diagnostic', () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const source = `const shared:number[]=[];function next(){shared.push(1);return 1;}export function Probe(props:{value?:number}){const {value=next()}=props;return ()=> <p>{value}</p>;}`;
	const result = compiler.request({
		kind: 'check',
		id: path.resolve('.tmp/unsafe-pattern.tsx'),
		source,
		root: process.cwd(),
		target: 'default',
		diagnostics: 'semantic'
	});
	const diagnostic = result.diagnostics.find((d) => d.code === 'EXACT2202');
	expect(diagnostic).toBeDefined();
	expect(diagnostic!.related?.length).toBeGreaterThan(0);
});
