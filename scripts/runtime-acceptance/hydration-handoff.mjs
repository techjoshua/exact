import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { hostSource } from './runtime-hosts.mjs';
import { withNativeHost } from './host.mjs';
import { createRequire } from 'node:module';

/** Runs the same packaged handoff and authority witnesses with SSR owned by every native host. */
export async function checkHydrationHandoff(root, temporary, browser, evidence) {
	const helper = path.join(root, 'framework-adapters/test-support/hydration-handoff-contract.ts');
	const prepared = path.join(temporary, 'prepare-hydration-handoff.mjs');
	await build({
		entryPoints: [helper],
		outfile: prepared,
		bundle: true,
		platform: 'node',
		format: 'esm',
		packages: 'external',
		external: ['../vite-plugin/*', '../webpack-plugin/*', '../bun-plugin/*'],
		define: { 'import.meta.url': JSON.stringify(pathToFileURL(helper).href) }
	});
	const { prepareHydrationHandoffFixture } = await import(pathToFileURL(prepared).href);
	const fixture = await prepareHydrationHandoffFixture('vite');
	try {
		const bootstrap = path.join(fixture.root, 'runtime-client.mjs');
		await writeFile(
			bootstrap,
			`import {mountPage} from ${JSON.stringify(path.resolve(fixture.root, fixture.entries.client))};import {verifyHydrationHandoff} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/hydration-handoff-journey.mjs'))};try{const html=await (await fetch('/markup')).text();await verifyHydrationHandoff(mountPage,html,async(mode,value)=>window.recordHandoff(mode,value));window.handoffDone=true;}catch(error){window.handoffFailure=String(error.stack??error);}`
		);
		const client = await build({
			entryPoints: [bootstrap],
			bundle: true,
			platform: 'browser',
			format: 'esm',
			write: false
		});
		const handler = path.join(fixture.root, 'runtime-handler.mjs');
		await writeFile(
			handler,
			`import {serverHtml} from ${JSON.stringify(path.resolve(fixture.root, fixture.entries.server))};export const app={contexts:{},async fetch(request){const url=new URL(request.url);if(url.pathname==='/markup')return new Response((await serverHtml()).htmlWithHydration,{headers:{'content-type':'text/html'}});if(url.pathname==='/handoff-client.js')return new Response(${JSON.stringify(client.outputFiles[0].text)},{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><body><script type="module" src="/handoff-client.js"></script>',{headers:{'content-type':'text/html'}});}};`
		);
		const captureRoot =
			process.env.EXACT_HANDOFF_EVIDENCE_DIR ?? path.join(temporary, 'hydration-handoff-evidence');
		await mkdir(captureRoot, { recursive: true });
		const check = async (origin, label) => {
			const page = await browser.newPage(),
				errors = [],
				responses = [],
				raw = [];
			await page.exposeFunction('recordHandoff', async (mode, value) => {
				raw.push({ mode, value });
				await Promise.all(responses);
				await writeFile(
					path.join(captureRoot, label + '-' + mode + '.json'),
					JSON.stringify(value, null, 2)
				);
			});
			page.on('pageerror', (error) => errors.push(error.message));
			let responseSequence = 0;
			page.on('response', (response) => {
				const id = String(++responseSequence).padStart(3, '0');
				responses.push(
					(async () => {
						const body = await response.body(),
							request = response.request();
						await writeFile(path.join(captureRoot, label + '-' + id + '-response.bin'), body);
						await writeFile(
							path.join(captureRoot, label + '-' + id + '-request.json'),
							JSON.stringify(
								{
									url: request.url(),
									method: request.method(),
									headers: await request.allHeaders(),
									postData: request.postData(),
									status: response.status(),
									responseHeaders: await response.allHeaders()
								},
								null,
								2
							)
						);
					})()
				);
			});
			try {
				await page.goto(new URL('/', origin).href);
				await page.waitForFunction(() => window.handoffDone || window.handoffFailure);
				const failure = await page.evaluate(() => window.handoffFailure);

				await Promise.all(responses);
				await writeFile(
					path.join(captureRoot, label + '.json'),
					JSON.stringify({ records: raw, errors, failure }, null, 2)
				);
				assert.equal(failure, undefined);
				assert.deepEqual(errors, []);
				assert.equal(raw.filter((item) => !item.mode.endsWith('-before')).length, 5);
				evidence.executions.push({
					id: 'hydration-handoff-' + label,
					status: 'verified',
					tests: [
						'packaged-enhancement-target-adoption',
						'opaque-server-slot-recovery',
						'versioned-slot-authority',
						'receiving-owner-forwarding',
						'hydration-disposal'
					]
				});
				console.log(
					label + ': packaged enhancement adoption, recovery, authority and disposal passed'
				);
			} finally {
				await page.close();
			}
		};
		for (const runtime of ['node', 'bun', 'deno', 'cloudflare']) {
			const entry = path.join(fixture.root, 'handoff-' + runtime + '.mjs'),
				output = path.join(fixture.root, 'handoff-' + runtime + '.js');
			await writeFile(
				entry,
				`import {app} from ${JSON.stringify(handler)};\n` + hostSource(runtime)
			);
			await build({
				entryPoints: [entry],
				outfile: output,
				bundle: true,
				platform: runtime === 'cloudflare' ? 'browser' : 'node',
				format: 'esm',
				target: 'es2022'
			});
			if (runtime === 'cloudflare') {
				const worker = new Miniflare(
					convertV4MiniflareOptions({
						modules: true,
						scriptPath: output,
						compatibilityDate: '2026-07-30',
						compatibilityFlags: ['enable_request_signal'],
						host: '127.0.0.1',
						port: 0
					})
				);
				try {
					await check(await worker.ready, runtime);
				} finally {
					await worker.dispose();
				}
			} else {
				const executable =
					runtime === 'node'
						? process.execPath
						: runtime === 'bun'
							? (process.env.BUN_EXECUTABLE ?? 'bun')
							: createRequire(import.meta.url)('deno/install_api.cjs').runInstall();
				const args =
					runtime === 'deno'
						? ['run', '--no-config', '--no-lock', '--cached-only', '--allow-net=127.0.0.1', output]
						: [output];
				await withNativeHost(executable, args, (origin) => check(origin, runtime));
			}
		}
	} finally {
		await fixture.dispose();
	}
}
