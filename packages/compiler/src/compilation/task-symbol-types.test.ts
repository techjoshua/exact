import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

const cases = [
	[
		'local readonly property',
		'',
		'const marker=Symbol("local");const holder:{readonly token:typeof marker}={token:marker};const selected:typeof marker=holder.token;'
	],
	[
		'imported symbol',
		'import {visible} from "./keys.js";',
		'const selected:typeof visible=visible;'
	],
	[
		'private imported result',
		'import {privateToken} from "./keys.js";',
		'const selected:ReturnType<typeof privateToken>=privateToken();'
	],
	[
		'shadowed symbol',
		'import {visible as marker} from "./keys.js";',
		'const marker=Symbol("local");const holder:{readonly token:typeof marker}={token:marker};const selected:typeof marker=holder.token;'
	]
] as const;

for (const target of ['default', 'client', 'server'] as const)
	for (const [name, imports, declaration] of cases)
		it(`preserves ${name} identity in component task types (${target})`, async () => {
			const root = await createTestWorkspace('.exact-symbol-types-', path.resolve('.tmp'));
			await writeTestFiles(root, {
				'keys.ts':
					'const hidden=Symbol("hidden");export const visible=Symbol("visible");export function privateToken():typeof hidden{return hidden;}'
			});
			const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
			onTestFinished(() => compiler.dispose());
			const compile = (type: string, callerType = 'Awaited<ReturnType<typeof token>>') =>
				compiler.request({
					kind: target === 'default' ? 'check' : 'compile',
					target,
					root: process.cwd(),
					id: path.join(root, 'probe.tsx'),
					diagnostics: 'semantic',
					source: `import {TaskContext,type Component} from '@exactjs/core';${imports}
const other=Symbol('other');
export function Probe(this:Component<{text:string}>){
this.state.text='';
function token(task:TaskContext=TaskContext.client()){
${declaration}const result:${type}=selected;return result;
}
return()=> <button onClick={async()=>{const value:${callerType}=await token();this.state.text=String(value);}}>{this.state.text}</button>;
}`
				});
			const accepted = compile('typeof selected');
			expect(accepted.error).toBeUndefined();
			expect(accepted.diagnostics).toEqual([]);
			expect(accepted.analysis?.components[0].placement).toBe('isomorphic');
			const rejected = compile('typeof other');
			expect(rejected.diagnostics.some((diagnostic) => diagnostic.code === 'TS2322')).toBe(true);
			// The callable's result must retain its identity at the component event boundary too.
			const rejectedCaller = compile('typeof selected', 'typeof other');
			expect(rejectedCaller.diagnostics.some((diagnostic) => diagnostic.code === 'TS2322')).toBe(
				true
			);
		});
