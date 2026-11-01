import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { expect, onTestFinished } from 'vitest';
import { ExactCompilerSession } from '../expression/project.js';
import { createCompilerTestWorkspace } from './workspace.js';

/** Compiles and executes both ordinary targets, checking placement and the complete namespace.
 * Browser-only consumers must be absent on server. Portable consumers and extra observables
 * must remain present, so a successful process cannot hide a silently omitted export.
 */
export async function assertOrdinaryModuleNamespaces(test: {
	source: string;
	browser: boolean;
	placement?: 'unknown';
	extras?: Record<string, unknown>;
	compilerOwnedServerFunctions?: number;
}): Promise<void> {
	const root = await createCompilerTestWorkspace('.exact-module-namespace-', process.cwd());
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	const source = test.source + `export const stable='safe';`;
	for (const target of ['client', 'server'] as const) {
		const compiled = session.compileNative({
			kind: 'compile',
			id: path.join(root, 'entry.ts'),
			source,
			target,
			diagnostics: 'semantic'
		});
		expect(compiled.error).toBeUndefined();
		expect(compiled.diagnostics).toEqual([]);
		expect(compiled.analysis?.exports.find((value) => value.name === 'value')?.placement).toBe(
			test.placement ?? (test.browser ? 'client' : 'isomorphic')
		);
		const filename = path.join(root, target + '.mts');
		await writeFile(filename, compiled.code!);
		const result = spawnSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				(target === 'client' ? 'globalThis.document={title:"browser"};' : '') +
					`const values={...await import(${JSON.stringify(pathToFileURL(filename).href)})};
     for(const key of Object.keys(values))if(typeof values[key]==='function')values[key]='function';
     console.log(JSON.stringify(values));`
			],
			{ encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		const values: Record<string, unknown> = JSON.parse(result.stdout);
		const owned = Object.keys(values).filter((key) => key.startsWith('__exact_owned_'));
		expect(owned).toHaveLength(target === 'server' ? (test.compilerOwnedServerFunctions ?? 0) : 0);
		for (const key of owned) {
			expect(values[key]).toBe('function');
			delete values[key];
		}
		expect(values).toEqual(
			test.browser && target === 'server'
				? { stable: 'safe' }
				: { stable: 'safe', value: test.browser ? 'browser' : 'safe', ...test.extras }
		);
	}
}
