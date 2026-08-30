import assert from 'node:assert/strict';
import test from 'node:test';
import { measureRetainedHeap, measureRetainedMemory } from '../src/browser-memory.mjs';

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
			if (method === 'Runtime.getHeapUsage')
				return {
					usedSize: 2_600_000,
					totalSize: 4_000_000,
					embedderHeapUsedSize: 800_000,
					backingStorageSize: 120_000
				};
			if (method === 'Memory.getDOMCounters')
				return { documents: 2, nodes: 84, jsEventListeners: 12 };
			return {};
		}
	};

	assert.equal(await measureRetainedHeap(session), 2_663_008);
	assert.deepEqual(calls, [
		'HeapProfiler.collectGarbage',
		'Performance.getMetrics',
		'Runtime.getHeapUsage',
		'Memory.getDOMCounters'
	]);
	calls.length = 0;
	assert.deepEqual(await measureRetainedMemory(session), {
		jsHeapUsedBytes: 2_663_008,
		jsHeapTotalBytes: 4_000_000,
		embedderHeapUsedBytes: 800_000,
		backingStorageBytes: 120_000,
		documents: 2,
		nodes: 84,
		eventListeners: 12
	});
});
