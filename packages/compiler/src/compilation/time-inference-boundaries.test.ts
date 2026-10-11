import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

it.each([false, true])(
	'checks formatter identity before time auto-planning with shadowed Intl=%s',
	(shadowed) => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const source = `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};
export function View(startedAt:number${shadowed ? ',Intl:typeof globalThis.Intl' : ''}){return()=> <time time:update>{new Intl.RelativeTimeFormat('en-US').format(Math.floor((Date.now()-startedAt)/1000),'second')}</time>;}`;
		for (const target of ['client', 'server'] as const) {
			const result = compiler.request({
				kind: 'compile',
				id: path.resolve('.tmp/time-identity.tsx'),
				root: process.cwd(),
				source,
				target
			});
			expect(result.error).toBeUndefined();
			const errors = result.diagnostics.filter((d) => d.severity === 'error');
			if (shadowed) expect(errors.some((d) => d.code === 'EXACT_TIME_UNSAFE')).toBe(true);
			else expect(errors).toEqual([]);
		}
	}
);

const timingCases = [
	{
		name: 'floor quantization',
		prelude: '',
		content: 'Math.floor((Date.now()-startedAt)/1000)',
		valid: true
	},
	{
		name: 'ceil quantization',
		prelude: '',
		content: 'Math.ceil((startedAt-Date.now())/1000)',
		valid: true
	},
	{
		name: 'threshold with two precisions',
		prelude: 'const elapsed=Math.floor((Date.now()-startedAt)/1000);',
		content: 'elapsed<60 ? elapsed : Math.floor((Date.now()-startedAt)/60000)',
		valid: true
	},
	{
		name: 'local helper parameters',
		prelude: 'function elapsed(start:number,now:number){return Math.floor((now-start)/1000);}',
		content: 'elapsed(startedAt,Date.now())',
		valid: true
	},
	{
		name: 'opaque clock formatter',
		prelude: 'declare function opaque(value:number):string;',
		content: 'opaque(Date.now())',
		valid: false
	}
];
it.each(timingCases)(
	'keeps bounded time inference and rejection controls: $name',
	({ prelude, content, valid }) => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const source = `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};${prelude}
export function View(startedAt:number){return()=> <time time:update>{${content}}</time>;}`;
		for (const target of ['client', 'server'] as const) {
			const result = compiler.request({
				kind: 'compile',
				id: path.resolve('.tmp/time-controls.tsx'),
				root: process.cwd(),
				source,
				target
			});
			expect(result.error).toBeUndefined();
			const errors = result.diagnostics.filter((d) => d.severity === 'error');
			if (valid) expect(errors).toEqual([]);
			else expect(errors.some((d) => d.code === 'EXACT_TIME_UNSAFE')).toBe(true);
		}
	}
);
