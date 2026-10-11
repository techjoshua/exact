import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';

it.each([false, true])(
	'preserves explicit receiver policy after aggregate alias replacement=%s',
	(replaced) => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const source = `import type {Secret} from '@exactjs/secrets';declare const credential:Secret<string>;
function record(){return {credential,label:'public'};}
/** @exact keep=secret */ declare const kept:ReturnType<typeof record>;
let service=record();${replaced ? 'service=kept;' : ''}const copy=service;
export function Page(){return()=> <p>{copy.label}</p>;}`;
		for (const target of ['default', 'client', 'server'] as const) {
			const result = compiler.request({
				kind: 'analyze',
				id: path.resolve('.tmp/policy-alias-origin.tsx'),
				root: process.cwd(),
				source,
				target
			});
			expect(result.error).toBeUndefined();
			expect(result.diagnostics.some((d) => d.code === 'EXACT3020')).toBe(replaced);
		}
	}
);
