import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { ssrTimedCheckpointPath, writeSsrEvidence } from '../src/ssr-run-evidence.mjs';

describe('SSR run evidence', () => {
	it('persists a runtime checkpoint beside the requested final output', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'exact-ssr-evidence-'));
		try {
			const output = join(directory, 'nested', 'ssr.json');
			const checkpoint = ssrTimedCheckpointPath(output);
			await writeSsrEvidence(checkpoint, { complete: false, runtimes: { node: {} } });

			assert.equal(checkpoint, `${output}.timed.json`);
			assert.deepEqual(JSON.parse(await readFile(checkpoint, 'utf8')), {
				complete: false,
				runtimes: { node: {} }
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
