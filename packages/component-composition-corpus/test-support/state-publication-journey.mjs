import assert from 'node:assert/strict';
import { invokePreparedExact } from '../../hydrate/dist/invocations.js';

/** Verifies each performed-write mode with the same generated client capability as its server.
 * Every JSON/stream invocation owns its codec capture through parsing, planning and application.
 */
export async function verifyStatePublicationJourney({ endpoint, continuation, binding, fetch }) {
	assert.ok(continuation?.invocation, 'Missing compiler-owned invocation');
	assert.ok(continuation.dependencies.length > 0);
	assert.ok(binding, 'Missing generated Array binding');
	const roots = [
		...new Map(
			continuation.stateWrites
				.flatMap((write) => write.arrayRoots ?? [])
				.map((root) => [root.path.join('.'), root])
		).values()
	];
	assert.ok(roots.length, 'Missing compiler-owned Array roots');
	for (const stream of [false, true]) {
		for (const mode of [
			'delete',
			'skip',
			'undefined',
			'array-delete',
			'child-delete',
			'assign',
			'array',
			'child',
			'parent',
			'child-map',
			'map-reset',
			'scalar-helper',
			'async-scalar-helper',
			'local-method',
			'local-async-closure',
			'detached-child'
		]) {
			const state = {
				label: 'before',
				rows: ['a', 'b', 'c'],
				nested: { value: 'before', sibling: 'keep' },
				lookup: new Map()
			};
			const rows = state.rows;
			const capture = binding.capture(state, roots);
			try {
				const result = await invokePreparedExact(
					{
						endpoint,
						type: 'invoke',
						id: continuation.id,
						payload: { dependencies: Array(continuation.dependencies.length).fill(mode) },
						state,
						arrayCompletion: 4,
						arrayParser: { version: 4, parse: binding.parse },
						fetch,
						stream
					},
					{ encoded: capture.encodedState, valueDepth: capture.valueDepth }
				);
				assert.equal(result.arrayCompletion, 4);
				const patches = (result.mutations ?? []).filter((value) => value.operation === 'array-net');
				if (mode !== 'array' && mode !== 'array-delete') assert.equal(patches.length, 0);
				const plans = patches.map((patch) => binding.plan(patch, capture.correspondence));
				for (const plan of plans) binding.apply(plan);
				if (mode === 'array-delete') {
					assert.equal('state' in result, false);
					assert.equal('deletions' in result, false);
					assert.equal(patches.length, 1);
					assert.equal(state.rows, rows);
					assert.equal(rows.length, 3);
					assert.equal(Object.hasOwn(rows, 1), false);
					assert.equal(rows[0], 'a');
					assert.equal(rows[2], 'c');
				} else if (mode === 'delete' || mode === 'child-delete') {
					assert.deepEqual(result.deletions, ['label']);
					assert.equal('state' in result, false);
				} else if (mode === 'child-map') {
					assert.deepEqual(result.mutations, [
						{ path: 'lookup', operation: 'map-set', key: 'child', value: 1 }
					]);
					assert.equal('state' in result, false);
				} else if (mode === 'map-reset') {
					assert.deepEqual(result.state, { lookup: new Map([['fresh', 2]]) });
					assert.equal('mutations' in result, false);
				} else if (mode === 'detached-child') {
					assert.deepEqual(result.state, { label: 'after' });
				} else if (
					mode === 'child' ||
					mode === 'parent' ||
					mode === 'scalar-helper' ||
					mode === 'async-scalar-helper' ||
					mode === 'local-method' ||
					mode === 'local-async-closure'
				) {
					assert.deepEqual(result.state, { nested: { value: 'after' } });
					assert.deepEqual(result.statePaths, mode !== 'parent' ? ['nested.value'] : undefined);
				} else if (mode === 'array') {
					assert.equal('state' in result, false);
					assert.equal(patches.length, 1);
					assert.equal(state.rows, rows);
					assert.deepEqual(state.rows, ['a', 'b', 'c', 'd']);
					assert.equal('deletions' in result, false);
				} else if (mode === 'assign') {
					assert.deepEqual(result.state, { label: 'before' });
					assert.equal('deletions' in result, false);
				} else if (mode === 'undefined') {
					assert.deepEqual(result.state, { label: undefined });
					assert.equal('deletions' in result, false);
				} else {
					assert.equal('state' in result, false);
					assert.equal('deletions' in result, false);
				}
			} finally {
				capture.release();
			}
		}
	}
}
