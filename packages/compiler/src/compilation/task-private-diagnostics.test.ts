import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

for (const target of ['client', 'server'] as const)
	for (const [name, members, code] of [
		[
			'callback return',
			'#increment(fn:(value:number)=>number){return fn(1);}step(){return this.#increment(value=>"bad");}',
			'TS2322'
		],
		['private assignment', '#count=1;step(){this.#count="bad";}', 'TS2322'],
		[
			'optional private receiver',
			'#increment(){return 1;}step(){return this?.#increment();}',
			'TS18030'
		]
	] as const)
		it(`retains authored rejection for ${name} (${target})`, () => {
			const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
			onTestFinished(() => compiler.dispose());
			const result = compiler.request({
				kind: 'compile',
				target,
				root: process.cwd(),
				id: path.resolve('.tmp/task-private-routing-invalid.ts'),
				source: `export class Counter {${members}}`,
				diagnostics: 'semantic'
			});
			expect(result.diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
		});
