import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { withNativeHost } from '../../scripts/runtime-acceptance/host.mjs';
import { hostSource } from '../../scripts/runtime-acceptance/runtime-hosts.mjs';

/** Runs the same installed-package client assertions against one owned native Fetch server. */
export async function verifyNativeInstalledIslands(root, runtime) {
	assert.ok(['bun', 'deno', 'cloudflare'].includes(runtime));
	const entry = path.join(root, 'out', runtime + '-entry.mjs');
	const output = path.join(root, 'out', runtime + '-host.mjs');
	const fetchModule = fileURLToPath(new URL('./installed-islands-fetch.mjs', import.meta.url));
	await writeFile(
		entry,
		`import * as application from './server.mjs';
import {createInstalledIslandsFetch} from ${JSON.stringify(fetchModule)};
const app={fetch:createInstalledIslandsFetch(application)};
${hostSource(runtime)}`
	);
	await build({ entryPoints: [entry], outfile: output, bundle: true, platform: 'neutral' });
	const verify = async (origin) => {
		const verifier = fileURLToPath(new URL('./verify-installed-islands.mjs', import.meta.url));
		const result = await promisify(execFile)(process.execPath, [verifier, root, String(origin)], {
			timeout: 30_000
		});
		assert.equal(result.stderr, '');
		assert.match(result.stdout, /Installed islands retained identity/);
	};
	const runtimeRequire = createRequire(
		new URL('../../scripts/runtime-acceptance/package.json', import.meta.url)
	);
	if (runtime === 'cloudflare') {
		const { Miniflare, convertV4MiniflareOptions } = await import(
			pathToFileURL(runtimeRequire.resolve('miniflare')).href
		);
		// Installed fixtures live outside the workspace, so workerd must resolve from their own root.
		const worker = new Miniflare(
			convertV4MiniflareOptions({
				rootPath: root,
				modules: true,
				unsafeDirectSockets: [{ host: '127.0.0.1', port: 0 }],
				scriptPath: output,
				compatibilityDate: '2026-07-30',
				compatibilityFlags: ['enable_request_signal'],
				host: '127.0.0.1',
				port: 0
			})
		);
		try {
			await verify(await worker.unsafeGetDirectURL());
		} finally {
			await worker.dispose();
		}
	} else if (runtime === 'deno') {
		const executable = runtimeRequire('deno/install_api.cjs').runInstall();
		await withNativeHost(
			executable,
			['run', '--no-config', '--no-lock', '--cached-only', '--allow-net=127.0.0.1', output],
			verify
		);
	} else await withNativeHost(process.env.BUN_EXECUTABLE ?? 'bun', [output], verify);
}
