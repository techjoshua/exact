import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { compileFileArtifacts } from '@exactjs/compiler';
import { createControl } from './control.mjs';
import { withNativeHost } from './host.mjs';
import { progressSource } from '../../packages/component-composition-corpus/test-support/runtime-acceptance/progress-source.mjs';
import { checkNativeProgress } from './native-scenarios.mjs';
import { checkDispatch } from './dispatch-scenarios.mjs';
import { checkHydration } from './hydration-scenarios.mjs';
import { hostSource } from './runtime-hosts.mjs';

const root = path.resolve(import.meta.dirname, '../..');
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
	browser = await chromium.launch();
	const progressFile = path.join(temporary, 'Progress.tsx');
	await writeFile(progressFile, progressSource(control.origin));
	const progress = await compileFileArtifacts(progressFile, {
		rootDir: temporary,
		outDir: path.join(temporary, 'progress')
	});
	const page = await compileFileArtifacts(path.join(fixture, 'Page.tsx'), {
		rootDir: fixture,
		outDir: path.join(temporary, 'page')
	});
	const client = path.join(temporary, 'client.ts');
	await writeFile(
		client,
		`import {RuntimePage} from ${JSON.stringify(page.clientFile)};
import {createCompiledComponentReceipt} from '@exactjs/core/runtime/component-operations';
import {composeExactComponentContracts} from '@exactjs/core/framework/component-contracts';
import {hydrate,readExactHydrationConfig} from '@exactjs/hydrate';
window.runtimeClient=hydrate(createCompiledComponentReceipt(RuntimePage,{}),document.getElementById('root'),{
 ...readExactHydrationConfig(document),continuations:composeExactComponentContracts([RuntimePage],'client').continuations,endpoint:'/__exact',onErrorReport:report=>console.error(report.error),onDiagnostic:diagnostic=>console.error(diagnostic.message)
});`
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
			`import {NativeProgress,runCount} from ${JSON.stringify(progress.serverFile)};
import {RuntimePage,RuntimeShell} from ${JSON.stringify(page.serverFile)};
import {createApplication} from ${JSON.stringify(path.join(fixture, 'application.mjs'))};
import {${exported} as createHandler} from '@exactjs/${adapter}-adapter';
const app=createApplication({RuntimePage,RuntimeShell,NativeProgress,runCount,createHandler,clientCode:${JSON.stringify(clientCode)},control:${JSON.stringify(control.origin)}});
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
			console.log(
				`${label}: progress, dispatch/security/serialization, contexts, buffered/streamed SSR and browser hydration passed`
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
