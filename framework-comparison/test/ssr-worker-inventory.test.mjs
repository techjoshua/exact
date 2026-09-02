import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settleSsrWorkerInventoryStartup } from '../src/ssr-worker-inventory.mjs';

describe('SSR worker inventory startup', () => {
	it('starts the inventory concurrently and attaches each fulfilled worker', async () => {
		const entries = [{ key: 'slow' }, { key: 'fast' }];
		const events = [];
		const result = await settleSsrWorkerInventoryStartup(entries, async (entry) => {
			events.push(`start:${entry.key}`);
			await new Promise((resolve) => setTimeout(resolve, entry.key === 'slow' ? 10 : 0));
			events.push(`finish:${entry.key}`);
			return { key: entry.key };
		});

		assert.deepEqual(events.slice(0, 2), ['start:slow', 'start:fast']);
		assert.deepEqual(result.workers.map((worker) => worker.key).sort(), ['fast', 'slow']);
		assert.equal(result.failure, undefined);
		assert.equal(entries[0].worker.key, 'slow');
		assert.equal(entries[1].worker.key, 'fast');
	});

	it('retains successful workers for cleanup when another start fails', async () => {
		const entries = [{ key: 'ready' }, { key: 'failed' }];
		const failure = new Error('worker failed');
		const result = await settleSsrWorkerInventoryStartup(entries, async (entry) => {
			if (entry.key === 'failed') throw failure;
			return { key: entry.key };
		});

		assert.deepEqual(result.workers, [{ key: 'ready' }]);
		assert.equal(result.failure, failure);
		assert.equal(entries[0].worker.key, 'ready');
		assert.equal(entries[1].worker, undefined);
	});
});
