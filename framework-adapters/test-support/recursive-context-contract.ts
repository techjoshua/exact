import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Checks recursive context analysis terminates through both build targets and retains context residency errors. */
export async function verifyRecursiveContextContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
) {
	const edges = [[1, 3, 4], [4], [], [0], [0, 2, 3]];
	for (const target of ['client', 'server'] as const) {
		for (const invalid of [true, false]) {
			const tokens = Array.from(
				{ length: 5 },
				(_, index) =>
					`const Token${index}=createContext<number>('token${index}'${invalid && index === 0 ? ",{scope:'request'}" : ''});`
			).join('\n');
			const helpers = edges
				.map(
					(targets, index) =>
						`const helper${index}=()=>{this.getContext(Token${index});${targets.map((callee) => `helper${callee}();`).join('')}};`
				)
				.join('\n');
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import {createContext,TaskContext,type Component} from '@exactjs/core';
${tokens}
export function Page(this:Component<{}>){${helpers}function run(task:TaskContext=TaskContext.client()){helper0();}return()=> <button onClick={()=>run()}>ready</button>;}`
			);
			if (invalid) {
				await assert.rejects(
					() => buildDiagnosticFixture(adapter, root, target),
					(error: unknown) => /server-kept|server-only/.test(String(error)),
					`${adapter}/${target} lost the recursive helper's context residency constraint`
				);
			} else {
				await buildDiagnosticFixture(adapter, root, target);
			}
		}
	}
}
