import { reactive, watch } from '../index.js';
import assert from 'node:assert/strict';
import { it as test } from 'vitest';
import { captureArrayBefore, diffArrayCompletion } from './array-diff.js';
import {
	captureArraySubmission,
	parseArrayNetMutation,
	prepareArrayNetMutation,
	applyArrayNetPlan
} from './array-patch.js';
test('no-op and reverted member preserve a newer browser edit', () => {
	const a = { label: 'A' },
		rows = [a],
		before = captureArrayBefore(rows);
	a.label = 'X';
	a.label = 'A';
	assert.deepEqual(diffArrayCompletion(before, captureArrayBefore(rows), 'rows'), []);
});
test('move retains original records and unmodified browser payload', () => {
	const a = { label: 'A' },
		b = { label: 'B' },
		rows = [a, b],
		client = captureArraySubmission({ rows }, [{ path: ['rows'] }]),
		before = captureArrayBefore(rows);
	rows.reverse();
	b.label = 'B2';
	const mutations = diffArrayCompletion(before, captureArrayBefore(rows), 'rows');
	rows.reverse();
	a.label = 'local';
	const plan = prepareArrayNetMutation(mutations[0]!, client.correspondence);
	applyArrayNetPlan(plan);
	assert.equal(rows[0], b);
	assert.equal(rows[1], a);
	assert.equal(a.label, 'local');
	assert.equal(b.label, 'B2');
	client.release();
	assert.equal(client.correspondence.roots.size, 0);
});
test('unchanged duplicate does not reset changed canonical field', () => {
	const a = { label: 'A' },
		rows = [a, a],
		c = captureArraySubmission({ rows }, [{ path: ['rows'] }]);
	const patch = parseArrayNetMutation({
		operation: 'array-net',
		path: 'rows',
		beforeLength: 2,
		members: [{ index: 0, sets: [{ path: ['label'], value: 'X' }], deletions: [] }]
	});
	applyArrayNetPlan(prepareArrayNetMutation(patch, c.correspondence));
	assert.equal(a.label, 'X');
});
test('duplicate consumed once including prefix and suffix', () => {
	assert.throws(() =>
		parseArrayNetMutation({
			operation: 'array-net',
			path: 'rows',
			beforeLength: 2,
			span: { start: 1, deleteCount: 1, parts: [{ start: 0, count: 1 }] },
			members: []
		})
	);
});
test('late invalid member plans without prior live mutation', () => {
	const a = { label: 'A' },
		rows = [a],
		c = captureArraySubmission({ rows }, [{ path: ['rows'] }]);
	assert.throws(() =>
		prepareArrayNetMutation(
			parseArrayNetMutation({
				operation: 'array-net',
				path: 'rows',
				beforeLength: 1,
				members: [
					{
						index: 0,
						sets: [
							{ path: ['label'], value: 'X' },
							{ path: ['missing', 'deep'], value: 2 }
						],
						deletions: []
					}
				]
			}),
			c.correspondence
		)
	);
	assert.equal(a.label, 'A');
});
test('slot own undefined, hole and null remain distinct in output', () => {
	const rows: unknown[] = [1, 2],
		before = captureArrayBefore(rows);
	delete rows[0];
	rows[1] = undefined;
	rows.push(null);
	const patch = diffArrayCompletion(before, captureArrayBefore(rows), 'rows')[0]!;
	assert.deepEqual(patch.span?.parts, [
		{
			length: 3,
			slots: [
				[1, undefined],
				[2, null]
			]
		}
	]);
});
test('Object.is primitive signed zero and NaN matching', () => {
	const rows = [-0, +0, NaN],
		before = captureArrayBefore(rows);
	rows.reverse();
	const patch = diffArrayCompletion(before, captureArrayBefore(rows), 'rows')[0]!;
	assert.deepEqual(patch.span?.parts, [
		{ start: 2, count: 1 },
		{ start: 1, count: 1 },
		{ start: 0, count: 1 }
	]);
});
test('codec capture samples getter once and keeps wire correspondence aligned', () => {
	let reads = 0;
	const a = {
			get label() {
				return String(++reads);
			}
		},
		rows = [a];
	const capture = captureArraySubmission({ rows }, [{ path: ['rows'] }]);
	assert.equal(reads, 1);
	assert.equal((capture.encodedState as { rows: { label: string }[] }).rows[0]!.label, '1');
	assert.equal(capture.correspondence.roots.get('rows')!.occurrences.get(0), a);
});
test('nested transport Map Set values compare without per-kind operation engines', () => {
	const a = { data: new Map([['x', new Set([1])]]) },
		rows = [a],
		before = captureArrayBefore(rows);
	a.data.get('x')!.add(2);
	const patch = diffArrayCompletion(before, captureArrayBefore(rows), 'rows')[0]!;
	assert.equal(patch.members[0]!.sets[0]!.path[0], 'data');
	assert.deepEqual(patch.members[0]!.sets[0]!.value, a.data);
});
test('equal performed member remains a scalar publication', () => {
	const a = { label: 'A' },
		rows = [a],
		before = captureArrayBefore(rows);
	const writes = new Map([[a, new Map<PropertyKey, 'set' | 'delete'>([['label', 'set']])]]);
	const patch = diffArrayCompletion(before, captureArrayBefore(rows), 'rows', writes)[0]!;
	assert.deepEqual(patch.members[0]!.sets, [{ path: ['label'], value: 'A' }]);
});
test('equal performed Array slot remains structural', () => {
	const a = { label: 'A' },
		rows = [a],
		before = captureArrayBefore(rows);
	const writes = new Map([[rows, new Map<PropertyKey, 'set' | 'delete'>([['0', 'set']])]]);
	assert.ok(diffArrayCompletion(before, captureArrayBefore(rows), 'rows', writes)[0]!.span);
});
test('direct nested Array and Map members retain data through inserted occurrence', () => {
	for (const value of [[1], new Map([['a', 1]]), new Set([1])]) {
		const rows = [value],
			before = captureArrayBefore(rows);
		if (Array.isArray(value)) value.push(2);
		else if (value instanceof Map) value.set('b', 2);
		else value.add(2);
		const patch = diffArrayCompletion(before, captureArrayBefore(rows), 'rows')[0]!;
		assert.ok(patch.span);
		const part = patch.span.parts[0]!;
		assert.ok('slots' in part);
		assert.deepEqual(part.slots[0]![1], value);
	}
});
test('extra server duplicate occurrence is inserted per transport occurrence', () => {
	const a = { label: 'A' },
		rows = [a],
		before = captureArrayBefore(rows);
	rows.push(a);
	const patch = diffArrayCompletion(before, captureArrayBefore(rows), 'rows')[0]!;
	assert.deepEqual(patch.span?.parts, [{ length: 1, slots: [[0, { label: 'A' }]] }]);
});
test('last changed duplicate wins and unchanged duplicate never resets', () => {
	const a = { label: 'A' },
		rows = [a, a, a],
		c = captureArraySubmission({ rows }, [{ path: ['rows'] }]);
	const p = parseArrayNetMutation({
		operation: 'array-net',
		path: 'rows',
		beforeLength: 3,
		members: [
			{ index: 0, sets: [{ path: ['label'], value: 'first' }], deletions: [] },
			{ index: 2, sets: [{ path: ['label'], value: 'last' }], deletions: [] }
		]
	});
	applyArrayNetPlan(prepareArrayNetMutation(p, c.correspondence));
	assert.equal(a.label, 'last');
});
test('deterministic finite reorder/update property family preserves reference and data', () => {
	let seed = 71;
	const random = () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed;
	};
	for (let n = 0; n < 80; n++) {
		const rows = Array.from({ length: random() % 12 }, (_, i) => ({ label: String(i) })),
			initial = [...rows],
			c = captureArraySubmission({ rows }, [{ path: ['rows'] }]),
			before = captureArrayBefore(rows);
		for (let i = rows.length - 1; i > 0; i--) {
			const j = random() % (i + 1);
			[rows[i], rows[j]] = [rows[j]!, rows[i]!];
		}
		for (const row of rows) if (random() % 3 === 0) row.label += 'x';
		const expected = rows.map((row) => ({ row, label: row.label })),
			patches = diffArrayCompletion(before, captureArrayBefore(rows), 'rows');
		rows.splice(0, rows.length, ...initial);
		for (let i = 0; i < initial.length; i++) initial[i]!.label = String(i);
		for (const patch of patches)
			applyArrayNetPlan(prepareArrayNetMutation(parseArrayNetMutation(patch), c.correspondence));
		assert.equal(rows.length, expected.length);
		expected.forEach((e, i) => {
			assert.equal(rows[i], e.row);
			assert.equal(rows[i]!.label, e.label);
		});
		c.release();
	}
});
test('publishes a retained move as one observable sequence with a synchronous scheduler', () => {
	const a = { label: 'A' },
		b = { label: 'B' },
		rows = [a, b],
		capture = captureArraySubmission({ rows }, [{ path: ['rows'] }]),
		live = reactive(rows),
		seen: string[] = [];
	const stop = watch(
		() => {
			void live[0]!.label;
			void live[1]!.label;
		},
		() => seen.push(live.map((row) => row.label).join(','))
	);
	try {
		applyArrayNetPlan(
			prepareArrayNetMutation(
				parseArrayNetMutation({
					operation: 'array-net',
					path: 'rows',
					beforeLength: 2,
					span: {
						start: 0,
						deleteCount: 2,
						parts: [
							{ start: 1, count: 1 },
							{ start: 0, count: 1 }
						]
					},
					members: []
				}),
				capture.correspondence
			)
		);
		assert.deepEqual(seen, ['B,A']);
	} finally {
		stop();
		capture.release();
	}
});

test('later changed duplicate restores a previously deleted shared edge without resetting payload', () => {
	const q = { street: 'old', local: 'keep' },
		a: { edge?: typeof q } = { edge: q },
		rows = [a, a];
	const c = captureArraySubmission({ rows }, [{ path: ['rows'] }]);
	const patch = parseArrayNetMutation({
		operation: 'array-net',
		path: 'rows',
		beforeLength: 2,
		members: [
			{ index: 0, sets: [], deletions: [['edge']] },
			{ index: 1, sets: [{ path: ['edge', 'street'], value: 'new' }], deletions: [] }
		]
	});
	const plan = prepareArrayNetMutation(patch, c.correspondence);
	assert.equal(a.edge, q);
	applyArrayNetPlan(plan);
	assert.equal(a.edge, q);
	assert.equal(q.street, 'new');
	assert.equal(q.local, 'keep');
	c.release();
});
test('Array member length and nonnumeric field paths fail before application', () => {
	for (const key of ['length', 'other']) {
		const rows = [[1]],
			c = captureArraySubmission({ rows }, [{ path: ['rows'] }]);
		const patch = parseArrayNetMutation({
			operation: 'array-net',
			path: 'rows',
			beforeLength: 1,
			members: [{ index: 0, sets: [{ path: [key], value: 0 }], deletions: [] }]
		});
		assert.throws(() => prepareArrayNetMutation(patch, c.correspondence), /Unsupported Array/);
		assert.deepEqual(rows, [[1]]);
		c.release();
	}
});
