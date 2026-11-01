import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Builds the shared Array corpus with installed adapter packages, then exercises both artifacts.
 * The diagnostic owner releases the fixture, while the subprocess owns its HTTP server and client.
 */
export async function verifyArrayCompletionContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
): Promise<void> {
	const source = path.join(
		workspace,
		'packages/component-composition-corpus/test-support/array-completions/member-only'
	);
	for (const name of ['page.tsx', 'helper.ts'])
		await writeFile(path.join(root, name), await readFile(path.join(source, name)));
	const entries: Record<string, string> = {};
	for (const target of ['client', 'server'] as const) {
		await writeFile(
			path.join(root, 'entry.tsx'),
			target === 'server'
				? `export {RootDirect,RootHelper,MemberHelper} from './page.js';`
				: `import {RootDirect,RootHelper,MemberHelper} from './page.js';
import {composeExactComponentContracts} from '@exactjs/core/framework/component-contracts';
import {createExactClient} from '@exactjs/hydrate';
const pages={RootDirect,RootHelper,MemberHelper};
const registration=composeExactComponentContracts(Object.values(pages),'client');
export const ids=Object.fromEntries(Object.entries(pages).map(([name,page])=>[name,Object.keys(composeExactComponentContracts([page],'client').continuations)[0]]));
export function start(container:Element,state:unknown,endpoint:string,fetch:typeof globalThis.fetch,reports:unknown[],stream:boolean){return createExactClient(container,{continuations:registration.continuations,continuationArrays:registration.continuationArrays,state,endpoint,fetch,stream,batch:false,onErrorReport:report=>reports.push(report),onDiagnostic:diagnostic=>reports.push(diagnostic),logger:{log:event=>reports.push(event)}});}`
		);
		assert.deepEqual(
			await buildDiagnosticFixture(adapter, root, target, false, true, false, workspace),
			[]
		);
		const entry = (await readdir(path.join(root, 'out-' + target))).find((name) =>
			/^entry\.(?:js|mjs|cjs)$/.test(name)
		);
		assert.ok(entry, 'Missing ' + target + ' Array artifact');
		entries[target] = './out-' + target + '/' + entry;
	}
	const runner = path.join(root, 'array-journey.mjs');
	await writeFile(
		runner,
		`import {verifyArrayCompletionArtifacts} from ${JSON.stringify(new URL('./array-completion-journey.mjs', import.meta.url).href)};
await verifyArrayCompletionArtifacts(${JSON.stringify(entries)});`
	);
	const result = await promisify(execFile)(
		adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
		[runner],
		{ cwd: root, timeout: 30000 }
	);
	assert.deepEqual(JSON.parse(result.stdout.trim()), { requests: 8, streams: 2, verified: true });
}
