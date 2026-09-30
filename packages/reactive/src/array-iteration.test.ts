import { computed, flushSync, reactive, ref, subscribe } from './index.js';
import { expect, it, onTestFinished } from 'vitest';

for (const method of ['spread', 'values', 'entries'] as const) {
	it(`retains object-array iteration order through ${method}`, () => {
		const state = reactive({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] });
		const snapshot = computed(() =>
			method === 'spread'
				? [...state.items]
				: method === 'values'
					? Array.from(state.items.values())
					: Array.from(state.items.entries(), ([, value]) => value)
		);
		const source = ref(snapshot)!;
		const seen: number[][] = [];
		const stop = subscribe(source, () => seen.push(source.get().map((row) => row.id)));
		onTestFinished(stop);
		expect(source.get().map((row) => row.id)).toEqual([1, 2, 3]);
		state.items.reverse();
		flushSync();
		expect(source.get().map((row) => row.id)).toEqual([3, 2, 1]);
		state.items.sort((a, b) => a.id - b.id);
		flushSync();
		expect(source.get().map((row) => row.id)).toEqual([1, 2, 3]);
		state.items.splice(1, 1, { id: 4 });
		flushSync();
		expect(source.get().map((row) => row.id)).toEqual([1, 4, 3]);
		expect(seen).toEqual([
			[3, 2, 1],
			[1, 2, 3],
			[1, 4, 3]
		]);
		stop();
	});
}

it('keeps unchanged keys quiet while publishing length changes', () => {
	const items = reactive([{ id: 1 }, { id: 2 }]);
	const keys = computed(() => Array.from(items.keys()));
	const source = ref(keys)!;
	const seen: number[][] = [];
	const stop = subscribe(source, () => seen.push(source.get()));
	onTestFinished(stop);
	expect(source.get()).toEqual([0, 1]);
	items.reverse();
	flushSync();
	expect(seen).toEqual([]);
	items.push({ id: 3 });
	flushSync();
	expect(seen).toEqual([[0, 1, 2]]);
	stop();
	items.pop();
	flushSync();
	expect(seen).toEqual([[0, 1, 2]]);
});
