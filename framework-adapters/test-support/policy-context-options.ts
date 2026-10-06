import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Native context aliases preserve request residency through each adapter's resolver. */
export async function verifyPolicyContextOptions(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
): Promise<void> {
	for (const target of ['client', 'server'] as const)
		for (const [factory, options, denied] of [
			['context', '{"scope":"request"}', true],
			['core["createContext"]', '{scope:"request"}', true],
			['context', '{...requestOptions}', true],
			['context', '{scope:"component",reactive:false}', false],
			['context', '{...requestOptions,scope:"component"}', false]
		] as const) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import{createContext as context,TaskContext,type Component}from '@exactjs/core';import * as core from '@exactjs/core';const requestOptions={scope:'request'} as const;const Token=${factory}<string>('token',${options});export function Page(this:Component<{label:string}>){this.state.label='public';const read=(_task:TaskContext=TaskContext.client())=>{this.state.label=this.getContext(Token);};return()=> <button onClick={()=>read()}>{this.state.label}</button>;}`
			);
			let failure: unknown;
			try {
				await buildDiagnosticFixture(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			if (denied) {
				assert.ok(failure, `${adapter}/${target} accepted a request context in client work`);
				assert.match(String(failure), /server-kept|server-only/);
			} else assert.equal(failure, undefined, `${adapter}/${target}/${factory}/${options}`);
		}
}
