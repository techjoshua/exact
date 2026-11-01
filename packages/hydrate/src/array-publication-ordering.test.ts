import { describe, it, expect } from 'vitest';

import {
	captureArraySubmission,
	parseArrayNetMutation
} from '@exactjs/reactive/framework/array-patch';
import { captureStateMembers, prepareStatePublication } from './state-publication.js';
import { acceptComponentStateCommit } from './runtime/state-ordering.js';
import type { ExactContinuationStatePathContract } from '@exactjs/core/framework/component-contracts';
// These unit permissions exercise publication ordering. Generated authority is
// independently qualified by the paired native and compiler runtime tests.
const writes: ExactContinuationStatePathContract[] = [
	{
		kind: 'write',
		path: 'rows',
		operation: 'value',
		confidence: 'exact',
		arrayRoots: [{ kind: 'array', path: ['rows'], confidence: 'exact' }]
	}
];
const memberWrites: ExactContinuationStatePathContract[] = [
	{
		kind: 'write',
		path: 'rows.0.label',
		operation: 'value',
		confidence: 'exact',
		arrayRoots: [{ kind: 'array', path: ['rows'], confidence: 'exact' }]
	}
];
const binding = {
	capture: captureArraySubmission,
	parse: parseArrayNetMutation,
	plan: (await import('@exactjs/reactive/framework/array-patch')).prepareArrayNetMutation,
	apply: (await import('@exactjs/reactive/framework/array-patch')).applyArrayNetPlan
};
function fixture() {
	const a = { label: 'A' },
		b = { label: 'B' },
		rows = [a, b],
		state = { rows },
		owner = {};
	const capture = captureArraySubmission({ rows }, [{ path: ['rows'] }]);
	const members = captureStateMembers(state, memberWrites);
	const reorder = () =>
		prepareStatePublication(
			state,
			{
				mutations: [
					{
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
					}
				]
			},
			writes,
			members,
			{ binding, correspondence: capture.correspondence }
		)!;
	const slot = (deletion = false) =>
		prepareStatePublication(
			state,
			deletion ? { deletions: ['rows.0'] } : { state: { rows: { 0: 99 } }, statePaths: ['rows.0'] },
			writes,
			new Map()
		)!;
	return { a, b, rows, state, owner, capture, members, reorder, slot };
}
describe('actual raw Array history across scalar and completion channels', () => {
	it.each([false, true])('new slot %s fences older reorder', (deletion) => {
		const f = fixture(),
			newer = f.slot(deletion),
			older = f.reorder();
		expect(acceptComponentStateCommit(f.owner, writes, 2, newer.footprint)).toBe(true);
		newer.apply();
		expect(acceptComponentStateCommit(f.owner, writes, 1, older.footprint)).toBe(false);
	});
	it.each([false, true])('new reorder fences older slot %s', (deletion) => {
		const f = fixture(),
			newer = f.reorder(),
			older = f.slot(deletion);
		expect(acceptComponentStateCommit(f.owner, writes, 2, newer.footprint)).toBe(true);
		newer.apply();
		expect(acceptComponentStateCommit(f.owner, writes, 1, older.footprint)).toBe(false);
	});
	it('equal performed slot set retains structural fencing', () => {
		const f = fixture();
		const newer = prepareStatePublication(
			f.state,
			{ state: { rows: { 0: f.a } }, statePaths: ['rows.0'] },
			writes,
			new Map()
		)!;
		expect(acceptComponentStateCommit(f.owner, writes, 2, newer.footprint)).toBe(true);
		expect(acceptComponentStateCommit(f.owner, writes, 1, f.reorder().footprint)).toBe(false);
	});
	it('disjoint retained payload and reorder complete independently', () => {
		const f = fixture();
		const payload = prepareStatePublication(
			f.state,
			{ state: { rows: { 0: { label: 'A1' } } }, statePaths: ['rows.0.label'] },
			memberWrites,
			f.members
		)!;
		const reorder = f.reorder();
		expect(acceptComponentStateCommit(f.owner, writes, 2, reorder.footprint)).toBe(true);
		reorder.apply();
		expect(acceptComponentStateCommit(f.owner, memberWrites, 1, payload.footprint)).toBe(true);
		payload.apply();
		expect(f.rows).toEqual([f.b, f.a]);
		expect(f.a.label).toBe('A1');
	});
	it('same canonical field and root replacement still fence', () => {
		const f = fixture();
		const older = prepareStatePublication(
			f.state,
			{ state: { rows: { 0: { label: 'old' } } }, statePaths: ['rows.0.label'] },
			memberWrites,
			f.members
		)!;
		const root = prepareStatePublication(
			f.state,
			{ state: { rows: [] }, statePaths: ['rows'] },
			writes,
			new Map()
		)!;
		expect(acceptComponentStateCommit(f.owner, writes, 2, root.footprint)).toBe(true);
		root.apply();
		expect(acceptComponentStateCommit(f.owner, memberWrites, 1, older.footprint)).toBe(false);
	});
	it('earlier Q field survives replacement of only another edge', () => {
		const q = { street: 'old' },
			a = { edge: q },
			b = { edge: q },
			rows = [a, b];
		const c = captureArraySubmission({ rows }, [{ path: ['rows'] }]);
		const patch = parseArrayNetMutation({
			operation: 'array-net',
			path: 'rows',
			beforeLength: 2,
			members: [
				{ index: 0, sets: [{ path: ['edge', 'street'], value: 'new' }], deletions: [] },
				{ index: 1, sets: [{ path: ['edge'], value: { street: 'replacement' } }], deletions: [] }
			]
		});
		binding.apply(binding.plan(patch, c.correspondence));
		expect(a.edge).toBe(q);
		expect(q.street).toBe('new');
		expect(b.edge).not.toBe(q);
		expect(b.edge.street).toBe('replacement');
	});
});

it.each(['map', 'set'] as const)(
	'retains canonical %s journal receivers through a browser reorder',
	(kind) => {
		const one = kind === 'map' ? new Map<string, number>() : new Set<number>(),
			two = kind === 'map' ? new Map<string, number>() : new Set<number>(),
			a = { data: one },
			b = { data: two },
			rows = [a, b],
			state = { rows };
		const authority: ExactContinuationStatePathContract[] = [
			{
				kind: 'write',
				path: 'rows.0.data',
				operation: kind,
				confidence: 'exact',
				arrayRoots: [{ kind: 'array', path: ['rows'], confidence: 'exact' }]
			}
		];
		const members = captureStateMembers(state, authority);
		rows.reverse();
		const mutation =
			kind === 'map'
				? { operation: 'map-set' as const, path: 'rows.0.data', key: 'x', value: 1 }
				: { operation: 'set-add' as const, path: 'rows.0.data', value: 1 };
		const plan = prepareStatePublication(state, { mutations: [mutation] }, authority, members)!;
		plan.apply();
		expect(rows).toEqual([b, a]);
		expect(one.size).toBe(1);
		expect(two.size).toBe(0);
		expect(a.data).toBe(one);
	}
);
it('cannot bypass structural history through another alias of the same Array', () => {
	const f = fixture(),
		state = { rows: f.rows, alias: f.rows };
	const aliases: ExactContinuationStatePathContract[] = [
		{
			kind: 'write',
			path: 'alias',
			confidence: 'exact',
			operation: 'value',
			arrayRoots: [{ kind: 'array', path: ['alias'], confidence: 'exact' }]
		}
	];
	const newer = prepareStatePublication(
		state,
		{ state: { alias: { 0: 99 } }, statePaths: ['alias.0'] },
		aliases,
		new Map()
	)!;
	expect(acceptComponentStateCommit(f.owner, aliases, 2, newer.footprint)).toBe(true);
	newer.apply();
	expect(acceptComponentStateCommit(f.owner, writes, 1, f.reorder().footprint)).toBe(false);
});
it('intermediate slot creation fences old structure and does not retain a missing member anchor', () => {
	const f = fixture();
	delete f.rows[0];
	const members = captureStateMembers(f.state, memberWrites);
	const plan = prepareStatePublication(
		f.state,
		{ state: { rows: { 0: { label: 'created' } } }, statePaths: ['rows.0.label'] },
		memberWrites,
		members
	)!;
	expect(acceptComponentStateCommit(f.owner, memberWrites, 2, plan.footprint)).toBe(true);
	plan.apply();
	expect(f.rows[0]!.label).toBe('created');
	expect(acceptComponentStateCommit(f.owner, writes, 1, f.reorder().footprint)).toBe(false);
});
it('rejects unsupported length and late member entries before state mutation or history', () => {
	const f = fixture();
	expect(() =>
		prepareStatePublication(
			f.state,
			{ state: { rows: { length: 0 } }, statePaths: ['rows.length'] },
			writes,
			new Map()
		)
	).toThrow();
	expect(f.rows).toHaveLength(2);
	expect(() =>
		prepareStatePublication(
			f.state,
			{
				mutations: [
					{
						operation: 'array-net',
						path: 'rows',
						beforeLength: 2,
						members: [
							{ index: 0, sets: [{ path: ['label'], value: 'changed' }], deletions: [] },
							{ index: 1, sets: [{ path: ['missing', 'leaf'], value: 1 }], deletions: [] }
						]
					}
				]
			},
			writes,
			f.members,
			{ binding, correspondence: f.capture.correspondence }
		)
	).toThrow();
	expect(f.a.label).toBe('A');
	expect(acceptComponentStateCommit(f.owner, writes, 1, f.reorder().footprint)).toBe(true);
});
it('uses the same codec sample for nested Array roots and member correspondence', () => {
	let reads = 0;
	const nested = [{ label: 'A' }],
		row = {
			get nested() {
				reads++;
				return nested;
			}
		},
		rows = [row],
		state = { rows };
	const authority: ExactContinuationStatePathContract[] = [
		{
			kind: 'write',
			path: 'rows.0.nested.0.label',
			operation: 'value',
			confidence: 'exact',
			arrayRoots: [
				{ kind: 'array', path: ['rows'], confidence: 'exact' },
				{ kind: 'array', path: ['rows', '0', 'nested'], confidence: 'exact' }
			]
		}
	];
	const capture = captureArraySubmission(state, [
		{ path: ['rows'] },
		{ path: ['rows', '0', 'nested'] }
	]);
	const members = captureStateMembers(state, authority, undefined, capture.correspondence);
	expect(reads).toBe(1);
	expect(capture.correspondence.roots.get('rows.0.nested')?.source).toBe(nested);
	expect(members.get('rows.0.nested.0')?.receiver).toBe(nested[0]);
	capture.release();
	expect(capture.correspondence.samples.size).toBe(0);
});
it('does not read a skipped member through a conditional non-Array prefix', () => {
	let reads = 0;
	const state = {
		rows: {
			get 0() {
				reads++;
				return { label: 'A' };
			}
		}
	};
	const members = captureStateMembers(state, memberWrites);
	expect(members.size).toBe(0);
	expect(reads).toBe(0);
});

it.each([
	{},
	{ group: null },
	{ group: 3 },
	{ rows: [] },
	{ rows: [null] },
	{ rows: new Array(1) }
])('deletion of a missing parent is an unchanged no-history plan: %j', (initial) => {
	const state = initial as Record<string, unknown>,
		path = 'rows' in state ? 'rows.0.label' : 'group.value';
	const before = structuredClone(state),
		permissions: ExactContinuationStatePathContract[] = [
			{ kind: 'write', confidence: 'exact', path }
		];
	const plan = prepareStatePublication(state, { deletions: [path] }, permissions, new Map())!;
	expect(plan.footprint.fields).toEqual([]);
	expect(plan.footprint.structures).toEqual([]);
	plan.apply();
	expect(state).toEqual(before);
	expect(acceptComponentStateCommit({}, permissions, 2, plan.footprint)).toBe(true);
});
it('sets create numeric parents while missing legacy collection receivers reject without writes', () => {
	const state: Record<string, unknown> = {},
		permissions: ExactContinuationStatePathContract[] = [
			{ kind: 'write', confidence: 'exact', path: 'group.0.label' }
		];
	prepareStatePublication(
		state,
		{ state: { group: { 0: { label: 'A' } } } },
		permissions,
		new Map()
	)!.apply();
	expect(state).toEqual({ group: [{ label: 'A' }] });
	const missing: Record<string, unknown> = {};
	expect(() =>
		prepareStatePublication(
			missing,
			{ mutations: [{ operation: 'map-set', path: 'group.values', key: 'x', value: 1 }] },
			[{ kind: 'write', confidence: 'exact', path: 'group.values', operation: 'map' }],
			new Map()
		)
	).toThrow();
	expect(missing).toEqual({});
});
