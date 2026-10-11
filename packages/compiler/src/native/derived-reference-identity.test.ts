import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

it('keeps type-only browser queries out of component placement', () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	for (const callable of [false, true]) {
		for (const runtime of [false, true]) {
			const label = runtime ? 'window.location.href' : '"public"';
			const body = `type Browser=typeof window;return ${label};`;
			const source = callable
				? `function read(){${body}}export function Page(){const label=read();return()=> <p>{label}</p>;}`
				: `export function Page(){type Browser=typeof window;const label=${label};return()=> <p>{label}</p>;}`;
			const response = compiler.request({
				kind: 'analyze',
				id: path.resolve('.tmp/type-query-placement.tsx'),
				root: process.cwd(),
				source,
				diagnostics: 'semantic'
			});
			expect(response.error).toBeUndefined();
			expect(response.analysis.components[0]?.placement).toBe(runtime ? 'client' : 'isomorphic');
		}
	}
});

it.each(['value', 'type', 'query'] as const)(
	'keeps imported %s declarations separate from colliding local derived positions',
	async (form) => {
		const root = await createTestWorkspace('.exact-derived-identity-', process.cwd());
		const prefix = `/// <reference path="./foreign.d.ts" />\nexport function Page(props:{label:string}){const `;
		const source =
			prefix +
			`local=props.label;${form === 'value' ? '' : `let typed:${form === 'query' ? 'typeof Foreign' : 'Foreign'};void typed!;`}return()=> <p>{local}:{local}:${form === 'value' ? 'Foreign' : '"typed"'}</p>;}`;
		// Source offsets are file-local. Align an unrelated declaration deliberately.
		const foreignPrefix = form === 'type' ? 'interface ' : 'declare const ';
		const foreign =
			' '.repeat(prefix.length - foreignPrefix.length) +
			foreignPrefix +
			(form === 'type' ? 'Foreign{label:string}' : 'Foreign:string;');
		const files = await writeTestFiles(root, {
			'page.tsx': source,
			'foreign.d.ts': foreign,
			'tsconfig.json': JSON.stringify({
				compilerOptions: {
					target: 'ESNext',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: 'preserve',
					strict: true
				},
				include: ['*.ts', '*.tsx']
			})
		});
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		for (const target of ['default', 'client', 'server'] as const) {
			const result = compiler.request({
				kind: target === 'default' ? 'check' : 'compile',
				id: files['page.tsx']!,
				root,
				source,
				target,
				diagnostics: 'semantic',
				configFile: path.join(root, 'tsconfig.json')
			});
			expect(result.error).toBeUndefined();
			expect(result.diagnostics).toEqual([]);
			if (target !== 'default') expect(result.code).not.toContain('Foreign.get(');
		}
	}
);

it.each([
	[
		'local',
		`export function Page(props:{label:string}){const label=props.label;type Label=typeof label;const echo:Label=label;return()=> <p>{label}:{echo}</p>;}`
	],
	[
		'qualified',
		`export function Page(props:{label:{value:string}}){const label=props.label;type Label=typeof label.value;const echo:Label=label.value;return()=> <p>{label.value}:{echo}</p>;}`
	],
	[
		'shadowed utility',
		`type ReturnType<T>=false;export function Page(props:{label:string}){const label=props.label;type Label=typeof label;const echo:Label=label;return()=> <p>{label}:{echo}</p>;}`
	],
	[
		'instantiated function',
		`export function Page(props:{read:<T>(value:T)=>T}){const read=props.read;type Selected=typeof read<string>;return()=> <button onClick={()=>{const selected:Selected=read;void selected('value')}}>{read.name}:{read.length}</button>;}`
	]
] as const)('preserves %s type queries of retained derived values', (_form, source) => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	for (const target of ['default', 'client', 'server'] as const) {
		const result = compiler.request({
			kind: target === 'default' ? 'check' : 'compile',
			id: path.resolve('.tmp/local-derived-type-query.tsx'),
			root: process.cwd(),
			source,
			target,
			diagnostics: 'semantic'
		});
		expect(result.error).toBeUndefined();
		expect(result.diagnostics).toEqual([]);
	}
});
