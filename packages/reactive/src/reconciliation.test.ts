import { describe, expect, it, vi } from 'vitest';
import {
	decodeReactiveProtocolValue,
	encodeReactiveProtocolValue,
	flushSync,
	reactive,
	registerReactiveListKey,
	snapshot,
	updateReactiveValue,
	watch,
	writeReactive
} from './index.js';

describe('@exact/reactive reconciliation', () => {
	it('uses keyed item hashes across moves and only reconciles changed items', () => {
		const state = reactive({
			records: [
				{ id: 'a', title: 'A' },
				{ id: 'b', title: 'B' }
			]
		});
		registerReactiveListKey(
			state.records,
			(item) => (item as { id: string }).id,
			'client',
			'member:id'
		);
		const a = state.records[0];
		const b = state.records[1];
		const serverRecords = [
			{ id: 'b', title: 'Changed' },
			{ id: 'a', title: 'A' }
		];
		registerReactiveListKey(
			serverRecords,
			(item) => (item as { id: string }).id,
			'server',
			'member:id'
		);
		const incoming = decodeReactiveProtocolValue(
			JSON.parse(JSON.stringify(encodeReactiveProtocolValue(serverRecords)))
		) as typeof serverRecords;

		writeReactive(state, ['records'], incoming);

		expect(state.records[0]).toBe(b);
		expect(state.records[0].title).toBe('Changed');
		expect(state.records[1]).toBe(a);
	});

	it('compares, snapshots, and reconciles deeply nested values without overflowing the stack', () => {
		const makeDeep = () => {
			const root: Record<string, any> = {};
			let cursor = root;
			for (let index = 0; index < 2_000; index++) cursor = cursor.next = { index };
			return root;
		};
		const state = reactive({ value: makeDeep() });
		expect(() => writeReactive(state, ['value'], makeDeep())).not.toThrow();
		const copy = snapshot(state.value);
		let cursor: any = copy;
		for (let index = 0; index < 2_000; index++) cursor = cursor.next;
		expect(cursor.index).toBe(1_999);
	});

	it('reconciles equal JSON-shaped compiler writes without notifying dependents', () => {
		const state = reactive({ project: { id: 'p1', title: 'Initial', tags: ['a'] } });
		const project = state.project;
		const seen: string[] = [];
		watch(() => seen.push(state.project.title));

		writeReactive(state, ['project'], JSON.parse('{"id":"p1","title":"Initial","tags":["a"]}'));
		flushSync();
		expect(state.project).toBe(project);
		expect(seen).toEqual(['Initial']);

		writeReactive(state, ['project'], JSON.parse('{"id":"p1","title":"Changed","tags":["a"]}'));
		flushSync();
		expect(state.project).toBe(project);
		expect(seen).toEqual(['Initial', 'Changed']);
	});

	it('does not notify a list observer for an identical large API refresh', () => {
		const records = Array.from({ length: 10_000 }, (_, id) => ({
			id: String(id),
			title: `Task ${id}`
		}));
		const state = reactive({ records });
		const observer = vi.fn(() => state.records.map((record) => record.title).join(','));
		watch(observer);

		writeReactive(state, ['records'], JSON.parse(JSON.stringify(records)));
		flushSync();

		expect(observer).toHaveBeenCalledTimes(1);
	});

	it('updates only changed keyed records during a partial API refresh', () => {
		const state = reactive({
			records: [
				{ id: 'a', title: 'A' },
				{ id: 'b', title: 'B' }
			]
		});
		registerReactiveListKey(state.records, (item) => (item as { id: string }).id);
		const a = state.records[0];
		const b = state.records[1];
		const aObserver = vi.fn(() => a.title);
		const bObserver = vi.fn(() => b.title);
		watch(aObserver);
		watch(bObserver);

		writeReactive(
			state,
			['records'],
			[
				{ id: 'a', title: 'A' },
				{ id: 'b', title: 'Changed' }
			]
		);
		flushSync();

		expect(aObserver).toHaveBeenCalledTimes(1);
		expect(bObserver).toHaveBeenCalledTimes(2);
	});

	it('rejects duplicate keys before a keyed API refresh can mutate state', () => {
		const state = reactive({
			records: [
				{ id: 'a', title: 'A' },
				{ id: 'b', title: 'B' }
			]
		});
		registerReactiveListKey(state.records, (item) => (item as { id: string }).id, 'Tasks.tsx:10');

		expect(() =>
			writeReactive(
				state,
				['records'],
				[
					{ id: 'a', title: 'New A' },
					{ id: 'a', title: 'Duplicate' }
				]
			)
		).toThrow('Duplicate key "a"');
		expect(state.records.map((record) => record.title)).toEqual(['A', 'B']);
	});

	it('publishes structured object writes only after the complete object is valid', () => {
		const state = reactive({ record: { first: 'old', second: 'old' } });
		const scheduled: string[] = [];
		watch(() => `${state.record.first}:${state.record.second}`, undefined, {
			onSchedule: () => scheduled.push(`${state.record.first}:${state.record.second}`)
		});

		writeReactive(state, ['record'], { first: 'new', second: 'new' });
		flushSync();

		expect(scheduled).toEqual(['new:new']);
	});

	it('replaces immutable records instead of attempting in-place reconciliation', () => {
		const frozen = Object.freeze({ title: 'old' });
		const state = reactive({ record: frozen });
		expect(() => writeReactive(state, ['record'], { title: 'new' })).not.toThrow();
		expect(state.record).not.toBe(frozen);
		expect(state.record.title).toBe('new');
	});

	it('preserves sparse array holes during compiler writes', () => {
		const initial = new Array<string>(3);
		initial[1] = 'middle';
		const state = reactive({ items: initial });
		const next = new Array<string>(4);
		next[2] = 'next';
		writeReactive(state, ['items'], next);
		expect(state.items.length).toBe(4);
		expect(0 in state.items).toBe(false);
		expect(1 in state.items).toBe(false);
		expect(2 in state.items).toBe(true);
		expect(3 in state.items).toBe(false);
	});

	it('reconciles cyclic structured values without recursing indefinitely', () => {
		const initial: { name: string; self?: unknown } = { name: 'node' };
		initial.self = initial;
		const state = reactive({ value: initial });
		const next: { name: string; self?: unknown } = { name: 'node' };
		next.self = next;
		expect(() => writeReactive(state, ['value'], next)).not.toThrow();
		expect(state.value.self).toBe(state.value);
	});

	it('resolves compound update paths once and performs push/pop without scanning retained items', () => {
		let pathReads = 0;
		const nested = reactive({ value: 1 });
		const target = reactive({
			get nested() {
				pathReads++;
				return nested;
			}
		});
		expect(updateReactiveValue(target, ['nested', 'value'], (value) => Number(value) + 1)).toBe(2);
		expect(pathReads).toBe(1);

		let itemReads = 0;
		const items: unknown[] = [];
		Object.defineProperty(items, '0', {
			configurable: true,
			enumerable: true,
			get() {
				itemReads++;
				return 'kept';
			}
		});
		items.length = 10_000;
		const list = reactive(items);
		list.push('new');
		list.pop();
		expect(itemReads).toBe(0);
	});
});
