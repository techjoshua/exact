import assert from 'node:assert/strict';
import test from 'node:test';
import { measureRetainedHeap } from '../src/browser-memory.mjs';

test('retained heap collection runs GC before reading the page metric', async () => {
	const calls = [];
	const session = {
		async send(method) {
			calls.push(method);
			if (method === 'Performance.getMetrics')
				return {
					metrics: [
						{ name: 'Nodes', value: 42 },
						{ name: 'JSHeapUsedSize', value: 2_663_008 }
					]
				};
			return {};
		}
	};

	assert.equal(await measureRetainedHeap(session), 2_663_008);
	assert.deepEqual(calls, ['HeapProfiler.collectGarbage', 'Performance.getMetrics']);
});
