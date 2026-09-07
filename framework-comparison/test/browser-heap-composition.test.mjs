import assert from 'node:assert/strict';
import test from 'node:test';
import { categorizeHeap, createHeapCompositionReport } from '../src/browser-heap-composition.mjs';
import { summarizeHeapComposition } from '../src/browser-heap-snapshot.mjs';

test('counts reordered snapshot fields once and preserves unknown types', () => {
	const composition = summarizeHeapComposition({
		snapshot: {
			meta: {
				node_fields: ['self_size', 'type'],
				node_types: ['number', ['code', 'object', 'new type']]
			}
		},
		nodes: [12, 0, 30, 1, 7, 2]
	});
	assert.deepEqual(composition, {
		nodeCount: 3,
		selfBytes: 49,
		selfBytesByType: { code: 12, object: 30, 'new type': 7 }
	});
	assert.deepEqual(categorizeHeap(composition), {
		code: 12,
		internals: 0,
		values: 30,
		strings: 0,
		native: 0,
		other: 7
	});
});

test('separates internal nodes, source strings, native nodes, and ordinary values', () => {
	assert.deepEqual(
		categorizeHeap({
			selfBytes: 28,
			selfBytesByType: {
				code: 1,
				hidden: 2,
				'object shape': 3,
				'sliced string': 4,
				native: 5,
				closure: 6,
				array: 7
			}
		}),
		{ code: 1, internals: 5, values: 13, strings: 4, native: 5, other: 0 }
	);
	assert.throws(() => categorizeHeap({ selfBytes: 2, selfBytesByType: { code: 1 } }), /reconcile/);
	assert.throws(() => categorizeHeap({ selfBytes: -1, selfBytesByType: { code: -1 } }), /Invalid/);
});

test('report averages complete samples so segments add to the mean total', () => {
	const run = fixture();
	const report = createHeapCompositionReport(run);
	assert.equal(report.series[0].values[0], 2 / 1e6);
	assert.equal(
		report.series.reduce((sum, series) => sum + series.values[0], 0),
		report.totals[0]
	);
	assert.equal(report.metadata.samplesPerFramework, 2);
	assert.throws(() => createHeapCompositionReport({ ...run, sampleCount: 3 }), /Unbalanced/);
	assert.throws(
		() => createHeapCompositionReport({ ...run, correctness: { status: 'failed' } }),
		/Incomplete/
	);
});

function fixture() {
	return {
		schemaVersion: 1,
		kind: 'framework-comparison-heap-composition',
		correctness: { status: 'passed' },
		createdAt: '2026-09-06T00:00:00Z',
		commit: 'fixture',
		browserVersion: 'fixture',
		sampleCount: 2,
		participants: [
			{
				name: 'Fixture',
				artifactHash: 'fixture',
				samples: [
					{ composition: { selfBytes: 4, selfBytesByType: { code: 1, object: 3 } } },
					{ composition: { selfBytes: 8, selfBytesByType: { code: 3, object: 5 } } }
				]
			}
		]
	};
}
