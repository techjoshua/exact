/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
import { describe, expect, it } from 'vitest';
import {
	decodeReactiveProtocolValue,
	encodeReactiveProtocolValue,
	flushSync,
	reactive,
	registerReactiveListKey,
	snapshot,
	unwrap,
	updateReactiveValue,
	watch,
	writeReactive
} from './index.js';
import { reactiveObjects } from './framework/objects.js';
import { updateReactiveShallow } from './reconciliation.js';

describe('@exactjs/reactive reconciliation', () => {
	it('replaces dynamic prop values without mutating nested objects in place', () => {
		const previous = { label: 'previous' };
		const next = { label: 'next' };
		const props = reactiveObjects<Record<string, unknown>>({ value: previous, removed: true });

		updateReactiveShallow(props, { value: next, added: true });

		expect(unwrap(props.value)).toBe(next);
		expect(previous).toEqual({ label: 'previous' });
		expect('removed' in props).toBe(false);
		expect(props.added).toBe(true);
	});

	it('replaces keyed transport data without mutating retained records', () => {
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

		expect(state.records[0]).not.toBe(b);
		expect(b.title).toBe('B');
		expect(state.records[0].title).toBe('Changed');
		expect(state.records[1]).not.toBe(a);
	});

	it('replaces and snapshots deeply nested values without overflowing the stack', () => {
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

	it('publishes equal-shaped replacements and moves subscriptions to their storage', () => {
		const state = reactive({ project: { title: 'Initial' } });
		const previous = state.project;
		const seen: string[] = [];
		const stop = watch(() => seen.push(state.project.title));
		try {
			const replacement = { title: 'Initial' };
			writeReactive(state, ['project'], replacement);
			flushSync();
			expect(unwrap(state.project)).toBe(replacement);
			expect(seen).toEqual(['Initial', 'Initial']);
			state.project.title = 'Changed';
			flushSync();
			expect(previous.title).toBe('Initial');
			expect(seen).toEqual(['Initial', 'Initial', 'Changed']);
		} finally {
			stop();
		}
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

	it('replaces cyclic structured values without recursing indefinitely', () => {
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
