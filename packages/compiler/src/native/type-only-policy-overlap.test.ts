import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

it.each(['client', 'server'] as const)(
	'preserves type-only browser queries inside %s tasks while checking executable reads',
	(placement) => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		for (const target of ['default', 'client', 'server'] as const) {
			for (const runtime of [false, true]) {
				const source = `import {TaskContext} from '@exactjs/core';
export function Page(){const run=(_task:TaskContext=TaskContext.${placement}())=>{
 type Browser=typeof window;${runtime ? 'void window.location.href;' : ''}};
 return()=> <button onClick={()=>run()}>Ready</button>;}`;
				const result = compiler.request({
					kind: target === 'default' ? 'check' : 'compile',
					id: path.resolve('.tmp/task-type-query-policy.tsx'),
					root: process.cwd(),
					source,
					target,
					diagnostics: 'semantic'
				});
				expect(result.error).toBeUndefined();
				const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
				if (runtime && placement === 'server')
					expect(
						errors.length,
						JSON.stringify({ target, source, diagnostics: result.diagnostics })
					).toBeGreaterThan(0);
				else expect(errors).toEqual([]);
			}
		}
	}
);

it.each(
	['server', 'secret'].flatMap((policy) =>
		['source', 'declaration'].map((form) => [policy, form] as const)
	)
)(
	'keeps imported %s %s type queries separate from forbidden client value reads',
	async (policy, form) => {
		const root = await createTestWorkspace('.exact-type-query-policy-', process.cwd());
		const files = await writeTestFiles(root, {
			[form === 'source' ? 'contract.ts' : 'contract.d.ts']:
				`/** @exact keep=${policy} */ export ${form === 'source' ? "const credential:string='configured';" : 'declare const credential:string;'} export ${form === 'source' ? "const label:string='public';export const title:string='heading';" : 'declare const label:string;export declare const title:string;'}`,
			'barrel.ts': `export {credential as renamed,label} from './contract.js';`,
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
		for (const target of ['default', 'client', 'server'] as const)
			for (const shape of [
				'named',
				'namespace',
				'reexport',
				'shorthand',
				'helper',
				'closure',
				'returned-object',
				'getter',
				'getter-closure',
				'method-alias',
				'computed'
			])
				for (const selection of ['type', 'public', 'protected']) {
					const namespace = shape === 'namespace' || shape === 'computed';
					const imports = namespace
						? "import * as config from './contract.js';"
						: shape === 'reexport'
							? "import {renamed as credential,label} from './barrel.js';"
							: "import {credential,label} from './contract.js';";
					const reference = namespace ? 'config.credential' : 'credential';
					const publicReference =
						shape === 'computed' ? 'config[props.key]' : namespace ? 'config.label' : 'label';
					const selectedReference = selection === 'public' ? publicReference : reference;
					const helper =
						shape === 'helper'
							? `function read(){return ${selectedReference};}`
							: shape === 'closure'
								? `function read(){return()=>${selectedReference};}`
								: shape === 'getter'
									? `function read(){return {get value(){return ${selectedReference};}};}`
									: shape === 'getter-closure'
										? `function read(){return {get value(){return ()=>${selectedReference};}};}`
										: shape === 'method-alias'
											? `const holder={read(){return ${selectedReference};}};const read=holder.read;`
											: shape === 'returned-object'
												? `function read(){return {value:${selectedReference}};}`
												: '';
					const read =
						shape === 'computed'
							? 'config[props.key]'
							: shape === 'helper'
								? 'read()'
								: shape === 'closure'
									? 'read()()'
									: shape === 'getter' || shape === 'returned-object'
										? 'read().value'
										: shape === 'getter-closure'
											? 'read().value()'
											: shape === 'method-alias'
												? 'read()'
												: shape === 'shorthand'
													? '{credential}'
													: reference;
					const source = `import {TaskContext} from '@exactjs/core';${imports}${helper}
export function Page(props:{key:${selection === 'protected' ? "'credential'|'label'" : "'label'|'title'"}}){const run=(_task:TaskContext=TaskContext.client())=>{
 type Credential=typeof ${reference};${selection === 'type' ? '' : `void (${selection === 'public' && (shape === 'named' || shape === 'namespace' || shape === 'reexport' || shape === 'shorthand') ? publicReference : read});`}};
 return()=> <button onClick={()=>run()}>Ready</button>;}`;
					const result = compiler.request({
						kind: target === 'default' ? 'check' : 'compile',
						id: path.join(root, 'page.tsx'),
						root,
						source,
						target,
						diagnostics: 'semantic',
						configFile: files['tsconfig.json']
					});
					expect(result.error).toBeUndefined();
					const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
					if (selection === 'protected')
						expect(
							errors.some((diagnostic) =>
								diagnostic.message.includes('client task reads or writes server-kept data')
							),
							JSON.stringify({ target, shape, selection, diagnostics: result.diagnostics })
						).toBe(true);
					else expect(errors, JSON.stringify({ target, shape, selection })).toEqual([]);
				}
	},
	// Each imported-policy case checks 99 semantic requests across all three targets.
	30_000
);
