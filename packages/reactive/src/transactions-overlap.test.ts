import { expect, it } from 'vitest';
import { captureReactiveMutations, reactive } from './index.js';

const orders = [
	[0, 1, 2],
	[0, 2, 1],
	[1, 0, 2],
	[1, 2, 0],
	[2, 0, 1],
	[2, 1, 0]
];

it.each(orders)('settles independent optimistic layers in order %s, %s, %s', (...order) => {
	for (const successful of [-1, 0, 1, 2]) {
		const state = reactive({ value: 0, items: [0], lookup: new Map([['key', 0]]) });
		const journals = [1, 2, 3].map((value) =>
			captureReactiveMutations(() => {
				state.value = value;
				state.items[0] = value;
				state.lookup.set('key', value);
			})
		);
		const rejected = new Set<number>();
		for (const index of order) {
			if (index === successful) journals[index]!.discard();
			else {
				rejected.add(index);
				journals[index]!.rollback();
			}
			const expected = [2, 1, 0].find((index) => !rejected.has(index));
			expect(state.value).toBe(expected === undefined ? 0 : expected + 1);
			expect(state.items).toEqual([state.value]);
			expect(state.lookup.get('key')).toBe(state.value);
		}
		state.value = 10;
		const next = captureReactiveMutations(() => {
			state.value = 11;
		});
		next.rollback();
		expect(state.value).toBe(10);
	}
});

it('preserves authoritative edits between independent optimistic layers', () => {
	const state = reactive({ value: 0, sibling: 0 });
	const first = captureReactiveMutations(() => {
		state.value = 1;
		state.sibling = 1;
	});
	state.value = 2;
	const second = captureReactiveMutations(() => {
		state.value = 3;
		state.sibling = 2;
	});
	first.rollback();
	second.rollback();
	expect(state).toEqual({ value: 2, sibling: 0 });
});

it('drains a long chain of rejected predecessors without recursive rollback', () => {
	const state = reactive({ value: 0 });
	const journals = Array.from({ length: 10_000 }, (_, index) =>
		captureReactiveMutations(() => {
			state.value = index + 1;
		})
	);
	for (const journal of journals) journal.rollback();
	expect(state.value).toBe(0);
});
