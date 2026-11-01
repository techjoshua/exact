import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

const execute = promisify(execFile);
const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Builds the shared state-publication corpus through both adapter targets and verifies the server artifact through request handling and the framework response decoder. */
export async function verifyStatePublicationContract(
	adapter: 'vite' | 'webpack' | 'bun'
): Promise<void> {
	const parent = path.join(workspace, '.tmp/state-publication-adapters');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, adapter + '-'));
	try {
		await Promise.all([
			readFile(
				path.join(
					workspace,
					'packages/component-composition-corpus/src/test-support/state-publication-helper.ts'
				),
				'utf8'
			).then((source) => writeFile(path.join(root, 'state-publication-helper.ts'), source)),
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/state-publication', type: 'module', private: true })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						target: 'ESNext',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						jsx: 'preserve',
						strict: true
					},
					include: ['*.tsx']
				})
			),
			readFile(
				path.join(
					workspace,
					'packages/component-composition-corpus/src/test-support/state-publication.fixtures.tsx'
				),
				'utf8'
			).then((source) => writeFile(path.join(root, 'entry.tsx'), source))
		]);
		for (const target of ['client', 'server'] as const)
			await buildDiagnosticFixture(adapter, root, target, false, true, false, workspace);
		const entry = path.join(root, 'out-server', adapter === 'webpack' ? 'entry.cjs' : 'entry.js');
		const runner = path.join(root, 'run.mjs');
		await writeFile(
			runner,
			`import assert from 'node:assert/strict';
import * as artifacts from ${JSON.stringify(pathToFileURL(entry).href)};
import * as clients from ${JSON.stringify(pathToFileURL(path.join(root, 'out-client', adapter === 'webpack' ? 'entry.cjs' : 'entry.js')).href)};
import {verifyStatePublicationJourney} from ${JSON.stringify(new URL('../../packages/component-composition-corpus/test-support/state-publication-journey.mjs', import.meta.url).href)};
import {composeExactComponentContracts,readExactComponentContract} from '@exactjs/core/framework/component-contracts';
import {bindTask,createTaskOwner} from '@exactjs/core/tasks';
import {composeExactExecutorContract,createFetchHandler} from '@exactjs/server';
const Page=artifacts.StatePublicationProbe??artifacts.default?.StatePublicationProbe;
assert.ok(Page,'Missing compiled component export');
await using taskOwner=createTaskOwner();
const task=(artifacts.publicationTask??artifacts.default?.publicationTask)(taskOwner);
const bound=bindTask(task,{owner:taskOwner});
assert.deepEqual(await Promise.all([task(1),bound(2)]),[1,2]);
assert.equal(bound.pendingCount,0);
const contract=composeExactExecutorContract([Page]);
const operation=readExactComponentContract(Page).continuations.find(value=>value.invocation&&value.dependencies.length>0);
assert.ok(operation,'Missing compiler-owned invocation');
assert.ok(operation.stateWrites.some(value=>value.path==='rows'&&value.confidence==='exact'),'Lost finite array authority');
const handle=createFetchHandler({contract});
const ClientPage=clients.StatePublicationProbe??clients.default?.StatePublicationProbe;
const registration=composeExactComponentContracts([ClientPage],'client');
const continuation=registration.continuations[operation.id];
await verifyStatePublicationJourney({endpoint:'http://fixture/__exact',continuation,binding:registration.continuationArrays[operation.id],fetch:(url,init)=>handle(new Request(url,init))});
assert.equal((artifacts.releasedPublicationResources??artifacts.default?.releasedPublicationResources)(),32,'Lost task resource cleanup across the artifact boundary');
console.log(JSON.stringify({target:'server',journeys:32,verified:true}));`
		);
		const result = await execute(
			adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
			[runner],
			{ cwd: root, timeout: 30000 }
		);
		assert.deepEqual(JSON.parse(result.stdout.trim()), {
			target: 'server',
			journeys: 32,
			verified: true
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
