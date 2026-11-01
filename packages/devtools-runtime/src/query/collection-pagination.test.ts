import { expect, it } from 'vitest';
import { paginateExactInspection } from '@exactjs/devtools-protocol';
import {
	paginateInspectionSources,
	InspectionCollectionCursorError,
	type InspectionCollectionSource
} from './collection-pagination.js';

function source(
	values: readonly unknown[],
	requests: string[] = [],
	local = false
): InspectionCollectionSource {
	return {
		size: local ? values.length : undefined,
		async read(page) {
			requests.push(page.cursor ?? 'start');
			const result = paginateExactInspection(values, page);
			return { values: result.values, nextCursor: result.nextCursor };
		}
	};
}

it('retains every row across independently paged sources without rereading earlier pages', async () => {
	const reads: string[] = [];
	const owners = [
		source(['client'], [], true),
		source(['a0', 'a1', 'a2', 'a3', 'a4'], reads),
		source(['b0', 'b1', 'b2'])
	];
	const values: unknown[] = [];
	let cursor: string | undefined;
	do {
		const page = await paginateInspectionSources(owners, { limit: 2, cursor }, 500);
		values.push(...page.values);
		cursor = page.nextCursor;
	} while (cursor);
	expect(values).toEqual(['client', 'a0', 'a1', 'a2', 'a3', 'a4', 'b0', 'b1', 'b2']);
	expect(reads).toEqual(['start', '1', '3']);
});

it('resumes retained local offsets in one read', async () => {
	const reads: string[] = [];
	const values = Array.from({ length: 300 }, (_, index) => index);
	const page = await paginateInspectionSources(
		[source(values, reads, true)],
		{ cursor: (299).toString(36), limit: 1 },
		1
	);
	expect(page.values).toEqual([299]);
	expect(page.nextCursor).toBeUndefined();
	expect(reads).toEqual([(299).toString(36)]);
});

it('resumes retained combined offsets across source boundaries and rejects offsets beyond the end', async () => {
	const owners = [source(['client'], [], true), source(['a0', 'a1']), source(['b0', 'b1'])];
	expect((await paginateInspectionSources(owners, { cursor: '3', limit: 2 }, 3)).values).toEqual([
		'b0',
		'b1'
	]);
	expect((await paginateInspectionSources(owners, { cursor: '5', limit: 2 }, 3)).values).toEqual(
		[]
	);
	await expect(
		paginateInspectionSources(owners, { cursor: '6', limit: 2 }, 3)
	).rejects.toBeInstanceOf(InspectionCollectionCursorError);
});

it.each([
	'!',
	'zzzzzzzzzzzzzzzz',
	'c2:{',
	'c2:{}',
	'c2:[0]',
	'c2:[-1,null]',
	'c2:[0.5,null]',
	'c2:[1,null]',
	'c2:[0,{}]',
	'c2:[0,""]'
])('rejects malformed collection cursors: %s', async (cursor) => {
	await expect(paginateInspectionSources([source([])], { cursor }, 500)).rejects.toBeInstanceOf(
		InspectionCollectionCursorError
	);
});

it.each([
	{ values: [], nextCursor: 'next' },
	{ values: [1, 2] },
	{ values: [1], nextCursor: '"'.repeat(2040) }
])('rejects nonadvancing, oversized, or unencodable source pages', async (result) => {
	await expect(
		paginateInspectionSources([{ read: async () => result }], { limit: 1 }, 500)
	).rejects.toThrow(TypeError);
});

it('rejects repeated source cursors while filling a page', async () => {
	let reads = 0;
	const cycling: InspectionCollectionSource = {
		async read() {
			return { values: [reads++], nextCursor: reads % 2 ? 'a' : 'b' };
		}
	};
	await expect(paginateInspectionSources([cycling], { limit: 4 }, 500)).rejects.toThrow(
		'did not advance'
	);
	expect(reads).toBe(3);
});
