import { describe, expect, it } from 'vitest';
import { NativeCompilerLanguageClient } from './async-language-client.js';
import { nativeCompilerProtocolVersion } from './process-contracts.js';

const nativeFixture = String.raw`
const readline = require('node:readline');
let synchronized = false;
const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.kind === 'shutdown') process.exit(0);
  if (request.kind === 'synchronize') synchronized = true;
  if (request.kind === 'analyze' && request.source === 'hang') return;
  const response = {
    protocolVersion: ${JSON.stringify(nativeCompilerProtocolVersion)},
    typescriptVersion: 'fixture',
    backendVersion: 'fixture',
    diagnostics: [],
    analysis: {},
    timings: {},
    ...(request.kind === 'analyze' && !synchronized ? { error: 'project was not synchronized' } : {})
  };
  process.stdout.write(JSON.stringify(response) + '\n');
});
`;

describe('asynchronous native language client', () => {
	it('cancels an active native phase immediately and replays project synchronization', async () => {
		const client = new NativeCompilerLanguageClient({
			executable: process.execPath,
			args: ['-e', nativeFixture],
			timeoutMs: 2_000
		});
		try {
			await client.request({ kind: 'synchronize', sources: [] });
			const controller = new AbortController();
			const hanging = client.request({ kind: 'analyze', source: 'hang' }, controller.signal);
			setTimeout(() => controller.abort(), 10);

			await expect(hanging).rejects.toMatchObject({ name: 'AbortError' });
			await expect(client.request({ kind: 'analyze', source: 'ready' })).resolves.toMatchObject({
				protocolVersion: nativeCompilerProtocolVersion
			});
		} finally {
			await client.dispose();
		}
	});

	it('times out a wedged phase and keeps later requests usable', async () => {
		const client = new NativeCompilerLanguageClient({
			executable: process.execPath,
			args: ['-e', nativeFixture],
			// Process startup shares this deadline with the deliberate hang. Keep enough headroom for
			// the replacement process to start under the repository's concurrent package test suite.
			timeoutMs: 1_000
		});
		try {
			await expect(client.request({ kind: 'analyze', source: 'hang' })).rejects.toThrow(
				'timed out during analyze'
			);
			await expect(client.request({ kind: 'synchronize', sources: [] })).resolves.toMatchObject({
				protocolVersion: nativeCompilerProtocolVersion
			});
		} finally {
			await client.dispose();
		}
	});
});
