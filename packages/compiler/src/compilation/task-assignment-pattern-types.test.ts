import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

const cases = [
	[
		'nested',
		'export function work(owner:{value:number}){({nested:[owner.value]}={nested:[VALUE]});}',
		'3',
		"'bad'",
		'TS2322'
	],
	[
		'loop',
		'export function work(owner:{value:number}){for(owner.value of [VALUE]){}}',
		'3',
		"'bad'",
		'TS2322'
	],
	[
		'private',
		'export class Owner extends Array<number>{#value=0;work(){[this.#value]=[VALUE];}}',
		'3',
		"'bad'",
		'TS2322'
	],
	[
		'readonly',
		'export function work(owner:{readonly value:number}){VALUE}',
		'void owner.value;',
		'[owner.value=3]=[];',
		'TS2540'
	]
] as const;

for (const target of ['default', 'client', 'server'] as const)
	for (const [name, template, valid, invalid, code] of cases)
		it(`retains ${name} assignment constraints at native reference boundaries (${target})`, () => {
			const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
			onTestFinished(() => compiler.dispose());
			const compile = (value: string) =>
				compiler.request({
					kind: target === 'default' ? 'check' : 'compile',
					root: process.cwd(),
					id: path.resolve('.tmp/task-assignment-types.ts'),
					target,
					diagnostics: 'semantic',
					source: template.replace('VALUE', value)
				});
			const accepted = compile(valid);
			expect(accepted.error).toBeUndefined();
			expect(accepted.diagnostics).toEqual([]);
			const rejected = compile(invalid);
			expect(rejected.diagnostics?.some((diagnostic) => diagnostic.code === code)).toBe(true);
		});
