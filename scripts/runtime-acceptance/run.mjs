import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { compileFileArtifacts, compileProjectArtifacts } from '@exactjs/compiler';
import { createControl } from './control.mjs';
import { withNativeHost } from './host.mjs';
import { progressSource } from '../../packages/component-composition-corpus/test-support/runtime-acceptance/progress-source.mjs';
import { checkNativeProgress } from './native-scenarios.mjs';
import { checkDispatch } from './dispatch-scenarios.mjs';
import { checkHydration } from './hydration-scenarios.mjs';
import { prepareEagerReplay } from './eager-replay.mjs';
import { hostSource } from './runtime-hosts.mjs';
import { checkInstalledIslands } from './installed-islands.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const evidenceFile =
	process.env.EXACT_ACCEPTANCE_REPORT ?? path.join(root, '.tmp/runtime-acceptance/evidence.json');
const evidence = {
	version: 1,
	runToken: process.env.EXACT_ACCEPTANCE_RUN_TOKEN ?? randomUUID(),
	started: new Date().toISOString(),
	revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
	dirty:
		execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '',
	node: process.version,
	browser: process.env.EXACT_ACCEPTANCE_BROWSER ?? 'chromium',
	executions: []
};
await rm(evidenceFile, { force: true });
const fixture = path.join(
	root,
	'packages/component-composition-corpus/test-support/runtime-acceptance'
);
await mkdir(path.join(root, '.tmp'), { recursive: true });
const temporary = await mkdtemp(path.join(root, '.tmp/runtime-acceptance-'));
let control;
let browser;
let worker;
let primaryFailure;
try {
	control = await createControl();
	const engine = process.env.EXACT_ACCEPTANCE_BROWSER ?? 'chromium';
	assert.ok(
		['chromium', 'firefox', 'webkit'].includes(engine),
		'Unknown acceptance browser: ' + engine
	);
	browser = await { chromium, firefox, webkit }[engine].launch();
	console.log('Browser engine: ' + engine);
	const progressFile = path.join(temporary, 'Progress.tsx');
	await writeFile(progressFile, progressSource(control.origin));
	const progress = await compileFileArtifacts(progressFile, {
		rootDir: temporary,
		outDir: path.join(temporary, 'progress')
	});
	for (const name of [
		'keyed-prop-replacement',
		'cancelled-task-catch',
		'collection-projection',
		'derived-pattern',
		'mutation-contract'
	])
		await writeFile(
			path.join(temporary, name + '.tsx'),
			await readFile(
				path.join(
					root,
					'packages/component-composition-corpus/src/test-support',
					name + '.fixtures.tsx'
				)
			)
		);
	const pageFile = path.join(temporary, 'Page.tsx');
	await writeFile(
		pageFile,
		(await readFile(path.join(fixture, 'Page.tsx'), 'utf8')).replaceAll(
			'__EXACT_CONTROL__',
			control.origin
		)
	);
	const pages = await compileProjectArtifacts([pageFile], {
		rootDir: temporary,
		outDir: path.join(temporary, 'page')
	});
	const page = pages.find((artifact) => artifact.inputFile === pageFile);
	assert.ok(page, 'Missing runtime page artifact');
	const eagerHandler = await prepareEagerReplay(temporary, fixture);
	const client = path.join(temporary, 'client.ts');
	await writeFile(
		client,
		`import {RuntimePage,RuntimeIsland,RuntimeScope} from ${JSON.stringify(page.clientFile)};
import {createCompiledComponentReceipt} from '@exactjs/core/runtime/component-operations';
import {composeExactComponentContracts} from '@exactjs/core/framework/component-contracts';
import {createExactClient,hydrate,readExactHydrationConfig} from '@exactjs/hydrate/enhanced';
const options={
 enhancementCatalog:new Map([['runtime-scope',RuntimeScope],['runtime-scope-peer',RuntimeScope]]),
 ...readExactHydrationConfig(document),continuations:composeExactComponentContracts([RuntimePage],'client').continuations,endpoint:'/__exact',islands:{RuntimeIsland},onErrorReport:report=>console.error(report.error),onDiagnostic:diagnostic=>console.error(diagnostic.message)
};
window.runtimeClient=location.pathname.includes('island-page')?createExactClient(document.getElementById('root'),options):hydrate(createCompiledComponentReceipt(RuntimeIsland,{}),document.getElementById('root'),options);
await window.runtimeClient.whenSettled();window.runtimeReady=true;`
	);
	const clientFile = path.join(temporary, 'client.js');
	await build({
		entryPoints: [client],
		outfile: clientFile,
		bundle: true,
		platform: 'browser',
		format: 'esm'
	});
	const clientCode = await readFile(clientFile, 'utf8');
	for (const runtime of ['node', 'bun', 'deno', 'cloudflare']) {
		const entry = path.join(temporary, runtime + '.mjs');
		const adapter = runtime === 'node' ? 'fetch' : runtime;
		const exported = {
			fetch: 'createExactFetchHandler',
			bun: 'createExactBunHandler',
			deno: 'createExactDenoHandler',
			cloudflare: 'createExactCloudflareHandler'
		}[adapter];
		await writeFile(
			entry,
			`import {eagerReplayResponse} from ${JSON.stringify(eagerHandler)};
import {NativeProgress,runCount} from ${JSON.stringify(progress.serverFile)};
import {RuntimePage,RuntimeShell,RuntimeIsland,RuntimeViews,RuntimeScope,RuntimeDeadline,deadlineState} from ${JSON.stringify(page.serverFile)};
import {createApplication} from ${JSON.stringify(path.join(fixture, 'application.mjs'))};
import {${exported} as createHandler} from '@exactjs/${adapter}-adapter';
const app=createApplication({eagerReplayResponse,RuntimePage,RuntimeShell,RuntimeIsland,RuntimeViews,RuntimeScope,RuntimeDeadline,deadlineState,NativeProgress,runCount,createHandler,clientCode:${JSON.stringify(clientCode)},control:${JSON.stringify(control.origin)}});
${hostSource(runtime)}`
		);
		const output = path.join(temporary, runtime + '-bundle.mjs');
		await build({
			entryPoints: [entry],
			outfile: output,
			bundle: true,
			platform: 'neutral',
			format: 'esm',
			conditions: ['worker'],
			mainFields: ['module', 'main'],
			external: ['node:*'],
			target: 'es2022'
		});
		const verify = async (origin, label = runtime) => {
			control.reset();
			await checkNativeProgress(origin, control.origin);
			await checkDispatch(origin, control.origin);
			await checkHydration(origin, browser, control.origin);
			evidence.executions.push({
				id: 'native-runtime-' + label,
				tests: ['native-progress', 'dispatch-policy', 'browser-hydration'],
				status: 'verified'
			});
			console.log(
				`${label}: progress, dispatch/security/serialization, contexts, theme reuse, buffered/streamed SSR and browser hydration passed`
			);
		};
		if (runtime === 'cloudflare') {
			worker = new Miniflare(
				convertV4MiniflareOptions({
					modules: true,
					unsafeDirectSockets: [{ host: '127.0.0.1', port: 0 }],
					scriptPath: output,
					compatibilityDate: '2026-07-30',
					compatibilityFlags: ['enable_request_signal'],
					host: '127.0.0.1',
					port: 0
				})
			);
			await verify(await worker.unsafeGetDirectURL());
			await worker.dispose();
			worker = undefined;
		} else if (runtime === 'deno') {
			const executable = createRequire(import.meta.url)('deno/install_api.cjs').runInstall();
			for (const flags of [[], ['--unstable-no-legacy-abort']])
				await withNativeHost(
					executable,
					[
						'run',
						'--no-config',
						'--no-lock',
						'--cached-only',
						...flags,
						'--allow-net=127.0.0.1',
						output
					],
					(origin) => verify(origin, flags.length ? 'deno (modern abort)' : 'deno (default abort)')
				);
		} else
			await withNativeHost(
				runtime === 'node' ? process.execPath : (process.env.BUN_EXECUTABLE ?? 'bun'),
				[output],
				verify
			);
	}
} catch (error) {
	primaryFailure = { error };
} finally {
	const cleanup = await Promise.allSettled(
		[
			() => worker?.dispose(),
			() => browser?.close(),
			() => control?.close(),
			() => rm(temporary, { recursive: true, force: true })
		].map((clean) => Promise.resolve().then(clean))
	);
	const failures = cleanup
		.filter((result) => result.status === 'rejected')
		.map((result) => result.reason);
	if (failures.length) {
		const cleanupError = new AggregateError(failures, 'Native acceptance cleanup failed');
		if (primaryFailure) console.error(cleanupError);
		else primaryFailure = { error: cleanupError };
	}
}

if (primaryFailure) throw primaryFailure.error;
await mkdir(path.dirname(evidenceFile), { recursive: true });
evidence.executions.push(...(await checkInstalledIslands(root, evidenceFile + '.installed.json')));
await writeFile(
	evidenceFile,
	JSON.stringify(
		{
			...evidence,
			finished: new Date().toISOString(),
			success: true,
			provenanceLimit: evidence.dirty
				? 'Uncommitted sources were executed. This SHA does not reproduce the tested variant.'
				: undefined
		},
		null,
		2
	) + '\n'
);
