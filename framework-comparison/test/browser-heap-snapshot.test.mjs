import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeHeapDominators } from '../src/browser-heap-snapshot.mjs';

test('heap dominators exclude weak edges and accumulate strong retained size', () => {
	const snapshot = {
		snapshot: {
			meta: {
				node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
				node_types: [['synthetic', 'object']],
				edge_fields: ['type', 'name_or_index', 'to_node'],
				edge_types: [['property', 'weak']]
			}
		},
		strings: ['root', 'owner', 'child', 'weak'],
		nodes: [0, 0, 1, 0, 2, 1, 1, 2, 10, 1, 1, 2, 3, 20, 0, 1, 3, 4, 100, 0],
		edges: [0, 0, 5, 1, 0, 15, 0, 0, 10]
	};
	const result = summarizeHeapDominators(snapshot);
	assert.equal(result.reachableNodeCount, 3);
	assert.equal(result.rootRetainedBytes, 30);
	assert.deepEqual(result.topDominators[0], {
		node: 1,
		type: 'object',
		name: 'owner',
		selfBytes: 10,
		retainedBytes: 30,
		dominatedNodes: 1
	});
});
