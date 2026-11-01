import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { startCdpServer } from '../../packages/devtools-agent/src/test-support/cdp-server.ts';

/** Checks real CDP discovery and WebSockets on the agent's native automation hosts. */
export async function checkCdpNative(root, temporary) {
	const entry = path.join(temporary, 'agent-cdp-entry.mjs');
	const output = path.join(temporary, 'agent-cdp-bundle.mjs');
	await writeFile(
		entry,
		`import {connectExactCdp,connectExactDevtoolsAgent} from '@exactjs/devtools-agent';
import {verifyCdpTransport,verifyCdpDiscoveryCancellation,verifyCdpHeaderCancellation,verifyCdpBoundaries,verifyCdpDiscoveryBounds} from ${JSON.stringify(path.join(root, 'packages/devtools-agent/src/test-support/cdp-journey.ts'))};
import {verifyAgentSessionFailures,verifyAgentBindingFailure,verifyAgentDisconnectFailures} from ${JSON.stringify(path.join(root, 'packages/devtools-agent/src/test-support/connection-failure-journey.ts'))};
await verifyAgentSessionFailures(connectExactDevtoolsAgent);
await verifyAgentBindingFailure(connectExactDevtoolsAgent);
await verifyAgentDisconnectFailures(connectExactDevtoolsAgent);
await verifyCdpTransport(connectExactCdp,process.argv[2],process.argv[3]);
await verifyCdpDiscoveryCancellation(connectExactCdp,process.argv[4]);
await verifyCdpHeaderCancellation(connectExactCdp,process.argv[5]);
await verifyCdpBoundaries(connectExactCdp,process.argv[3]);
await verifyCdpDiscoveryBounds(connectExactCdp,process.argv[2],process.argv[3]);`
	);
	await build({
		entryPoints: [entry],
		outfile: output,
		bundle: true,
		platform: 'neutral',
		format: 'esm',
		target: 'es2022'
	});
	const deno = createRequire(import.meta.url)('deno/install_api.cjs').runInstall();
	const executions = [];
	for (const [runtime, executable, flags] of [
		['node', process.execPath, []],
		['bun', process.env.BUN_EXECUTABLE ?? 'bun', []],
		['deno', deno, ['run', '--no-config', '--no-lock', '--cached-only', '--allow-net=127.0.0.1']],
		[
			'deno-modern-abort',
			deno,
			[
				'run',
				'--no-config',
				'--no-lock',
				'--cached-only',
				'--unstable-no-legacy-abort',
				'--allow-net=127.0.0.1'
			]
		]
	]) {
		const server = await startCdpServer();
		let discovery;
		let headers;
		try {
			discovery = await startCdpServer({ pendingDiscovery: true });
			headers = await startCdpServer({ holdDiscoveryHeaders: true });
			await promisify(execFile)(
				executable,
				[...flags, output, server.origin, server.socketUrl, discovery.origin, headers.origin],
				{
					cwd: root,
					timeout: 30_000,
					maxBuffer: 1024 * 1024
				}
			);
			if (server.paths.join(',') !== '/,/first,/second,/,/,/,/first')
				throw new Error('CDP target ownership mismatch');
			executions.push({
				id: 'native-agent-cdp-' + runtime,
				tests: [
					'cdp-exact-cancellation',
					'cdp-request-capacity',
					'cdp-explicit-target-ownership',
					'cdp-discovery-body-cancellation',
					'cdp-discovery-header-cancellation',
					'cdp-closed-request-settlement',
					'cdp-message-and-failure-boundaries',
					'cdp-discovery-byte-and-option-bounds',
					'agent-invalid-session-cleanup',
					'agent-partial-setup-cleanup',
					'agent-disconnect-failure-cleanup'
				],
				status: 'verified'
			});
			console.log(runtime + ': CDP discovery, cancellation, capacity and socket ownership passed');
		} finally {
			await Promise.all([server.close(), discovery?.close(), headers?.close()]);
		}
	}
	return executions;
}
