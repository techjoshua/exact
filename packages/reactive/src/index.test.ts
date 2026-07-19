import { describe, expect, it, vi } from 'vitest';
import {
	batch,
	computed,
	createEffectScope,
	createProfiledEffectScope,
	decodeReactiveProtocolValue,
	encodeReactiveProtocolValue,
	flushSync,
	isReactive,
	mutateReactiveArray,
	peek,
	reactive,
	ref,
	registerReactiveListKey,
	snapshot,
	subscribe,
	unwrap,
	updateReactiveValue,
	watch,
	withEffectScope,
	writeReactive
} from './index.js';

describe('@exact/reactive', () => {
	it('profiles scheduler work owned by an explicit effect scope', () => {
		const events: Array<{ subsystem: string; phase: string }> = [];
		const scope = createProfiledEffectScope((event) => events.push(event), undefined);
		const state = reactive({ count: 0 });
		try {
			withEffectScope(scope, () => watch(() => void state.count));
			state.count++;
			flushSync();

			expect(events).toContainEqual(
				expect.objectContaining({
					subsystem: 'reactive',
					phase: 'flush'
				})
			);
		} finally {
			scope.stop();
		}
	});

	it('round-trips keyed collections through a transparent protocol envelope', () => {
		const records = [
			{ id: 'a', title: 'A' },
			{ id: 'b', title: 'B' }
		];
		registerReactiveListKey(records, (item) => (item as { id: string }).id, 'test', 'member:id');
		const encoded = encodeReactiveProtocolValue({ records }) as {
			records: Record<string, unknown>;
		};
		expect(encoded.records).toMatchObject({
			$exact: 'keyed-collection',
			version: 1,
			keys: ['a', 'b']
		});
		expect(encoded.records.itemHashes as string[]).toHaveLength(2);
		const decoded = decodeReactiveProtocolValue(JSON.parse(JSON.stringify(encoded))) as {
			records: typeof records;
		};
		expect(Array.isArray(decoded.records)).toBe(true);
		expect(decoded.records).toEqual(records);
		expect(Object.keys(decoded.records)).toEqual(['0', '1']);
	});

	it('retains a locally mutated keyed item when a later server snapshot has the same hashes', () => {
		const state = reactive({
			records: [
				{ id: 'a', title: 'A', detail: { done: false } },
				{ id: 'b', title: 'B', detail: { done: false } }
			]
		});
		registerReactiveListKey(
			state.records,
			(item) => (item as { id: string }).id,
			'client',
			'member:id'
		);
		const retained = state.records[0];
		state.records[0].detail.done = true;

		const serverRecords = [
			{ id: 'a', title: 'A', detail: { done: true } },
			{ id: 'b', title: 'B', detail: { done: false } }
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
		let runs = 0;
		watch(() => {
			runs++;
			return state.records[0].detail.done;
		});
		writeReactive(state, ['records'], incoming);
		flushSync();

		expect(runs).toBe(1);
		expect(state.records[0]).toBe(retained);
	});

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

	it('rejects malformed keyed collection envelopes', () => {
		expect(() =>
			decodeReactiveProtocolValue({
				$exact: 'keyed-collection',
				version: 1,
				keys: ['a'],
				keyHash: '0'.repeat(32),
				itemHashes: [],
				itemsHash: '0'.repeat(32),
				items: [{ id: 'a' }]
			})
		).toThrow('Malformed eXact keyed-collection envelope');
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

	it('routes scheduler failures and leaves the watcher retryable', () => {
		const state = reactive({ count: 0 });
		const errors: unknown[] = [];
		const scheduler = vi.fn(() => {
			throw new Error('schedule failed');
		});
		watch(() => void state.count, scheduler, { onError: (error) => errors.push(error) });

		expect(() => {
			state.count++;
		}).not.toThrow();
		expect(() => {
			state.count++;
		}).not.toThrow();
		expect(scheduler).toHaveBeenCalledTimes(2);
		expect(errors).toHaveLength(2);
	});

	it('routes onSchedule failures and leaves the watcher retryable', () => {
		const state = reactive({ count: 0 });
		const errors: unknown[] = [];
		const onSchedule = vi.fn(() => {
			throw new Error('onSchedule failed');
		});
		watch(() => void state.count, undefined, {
			onSchedule,
			onError: (error) => errors.push(error)
		});

		state.count++;
		state.count++;
		expect(onSchedule).toHaveBeenCalledTimes(2);
		expect(errors).toHaveLength(2);
	});

	it("keeps a computed value's last successful result after a handled recompute error", () => {
		const state = reactive({ count: 1, fail: false });
		const errors: unknown[] = [];
		const scope = createEffectScope(undefined, (error) => errors.push(error));
		let value!: { get(): number };
		const seen: number[] = [];
		withEffectScope(scope, () => {
			value = computed(() => {
				if (state.fail) throw new Error('compute failed');
				return state.count * 2;
			});
			watch(() => seen.push(value.get()));
		});

		state.fail = true;
		flushSync();
		expect(errors).toHaveLength(1);
		expect(value.get()).toBe(2);
		expect(seen).toEqual([2]);

		state.fail = false;
		state.count = 2;
		flushSync();
		expect(value.get()).toBe(4);
		expect(seen).toEqual([2, 4]);
	});
	it('does not subscribe merely by obtaining a computed reference', () => {
		const state = reactive({ count: 1 });
		const value = computed(() => state.count * 2);
		let runs = 0;
		watch(() => {
			runs++;
			peek(() => ref(value));
		});
		state.count++;
		flushSync();
		expect(runs).toBe(1);
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

	it('retains keyed record identity when an API response reorders records', () => {
		const state = reactive({
			records: [
				{ id: 'a', title: 'A' },
				{ id: 'b', title: 'B' }
			]
		});
		const a = state.records[0];
		const b = state.records[1];
		registerReactiveListKey(state.records, (item) => (item as { id: string }).id);

		writeReactive(
			state,
			['records'],
			[
				{ id: 'b', title: 'B updated' },
				{ id: 'a', title: 'A' }
			]
		);

		expect(state.records[0]).toBe(b);
		expect(state.records[1]).toBe(a);
		expect(state.records[0].title).toBe('B updated');
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

	it('notifies array growth and preserves reused identities during an unregistered prepend', () => {
		const state = reactive({ activity: [] as Array<{ id: string; message: string }> });
		const lengths: number[] = [];
		const scheduledSnapshots: string[][] = [];
		watch(() => lengths.push(state.activity.length));
		watch(() => state.activity.map((item) => item.id), undefined, {
			onSchedule: () => scheduledSnapshots.push(state.activity.map((item) => item.id))
		});
		writeReactive(state, ['activity'], [{ id: 'first', message: 'First' }]);
		writeReactive(
			state,
			['activity'],
			[{ id: 'second', message: 'Second' }, ...state.activity.slice(0, 9)]
		);
		flushSync();

		expect(state.activity.map((item) => item.id)).toEqual(['second', 'first']);
		expect(lengths).toEqual([0, 2]);
		expect(scheduledSnapshots).toEqual([['first']]);
	});

	it('keeps keyed task and activity arrays valid across repeated component-style updates', () => {
		const state = reactive({
			tasks: [
				{ id: 'task', status: 'backlog', title: 'Task' },
				{ id: 'other', status: 'active', title: 'Other' }
			],
			activity: [] as Array<{ id: string; message: string }>
		});
		registerReactiveListKey(state.tasks, (item) => (item as { id: string }).id);
		watch(() => {
			if (state.activity.length)
				registerReactiveListKey(state.activity, (item) => (item as { id: string }).id);
		});
		let activityId = 0;
		const update = (status: string) => {
			const task = state.tasks.find((item) => item.id === 'task')!;
			const nextTask = { ...task, status };
			writeReactive(
				state,
				['tasks'],
				state.tasks.map((item) => (item.id === task.id ? nextTask : item))
			);
			writeReactive(
				state,
				['activity'],
				[{ id: String(++activityId), message: `Moved to ${status}` }, ...state.activity.slice(0, 9)]
			);
			flushSync();
		};

		update('active');
		update('backlog');

		expect(state.tasks.map((item) => item.id)).toEqual(['task', 'other']);
		expect(state.activity.map((item) => item.id)).toEqual(['2', '1']);
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

	it('deduplicates scheduling across a compiler-owned transaction', () => {
		const state = reactive({ first: 0, second: 0 });
		const scheduled = vi.fn();
		const render = vi.fn(() => void `${state.first}:${state.second}`);
		watch(render, undefined, { onSchedule: scheduled });

		batch(() => {
			state.first = 1;
			state.second = 2;
		});
		flushSync();

		expect(scheduled).toHaveBeenCalledTimes(1);
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('invalidates array length and removed indexes for direct writes', () => {
		const state = reactive({ items: ['a', 'b', 'c'] as Array<string | undefined> });
		const lengths: number[] = [];
		const removed: Array<string | undefined> = [];
		watch(() => lengths.push(state.items.length));
		watch(() => removed.push(state.items[2]));

		state.items[5] = 'f';
		flushSync();
		state.items.length = 1;
		flushSync();

		expect(lengths).toEqual([3, 6, 1]);
		expect(removed).toEqual(['c', undefined]);
	});

	it('tracks property-existence reads', () => {
		const state = reactive({ record: {} as Record<string, number> });
		const values: boolean[] = [];
		watch(() => values.push('answer' in state.record));
		state.record.answer = 42;
		flushSync();
		expect(values).toEqual([false, true]);
	});

	it('leaves non-plain objects intact', () => {
		const date = new Date(0);
		const map = new Map([['answer', 42]]);
		const state = reactive({ date, map });
		expect(state.date).toBe(date);
		expect(state.date.getTime()).toBe(0);
		expect(state.map.get('answer')).toBe(42);
		expect(reactive(date)).toBe(date);
		expect(snapshot(date)).toBe(date);
	});

	it('compares accessors without invoking them', () => {
		let reads = 0;
		const getter = () => {
			reads++;
			return 1;
		};
		const first = {} as { value: number };
		const second = {} as { value: number };
		Object.defineProperty(first, 'value', { configurable: true, enumerable: true, get: getter });
		Object.defineProperty(second, 'value', { configurable: true, enumerable: true, get: getter });
		const state = reactive({ record: first });
		state.record = second;
		expect(reads).toBe(0);
		expect(unwrap(state.record)).toBe(first);
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

	it('compares and snapshots cyclic graphs safely', () => {
		const value: { label: string; self?: unknown } = { label: 'node' };
		value.self = value;
		const state = reactive({ value });
		const copy = snapshot(state.value);
		expect(copy).not.toBe(value);
		expect(copy.self).toBe(copy);
		expect(() => {
			state.value = value;
		}).not.toThrow();
	});

	it('notifies mutations performed before a throwing array comparator', () => {
		const state = reactive({ items: [3, 2, 1] });
		const seen: string[] = [];
		watch(() => seen.push(state.items.join(',')));
		let comparisons = 0;
		expect(() =>
			state.items.sort((left, right) => {
				if (++comparisons > 1) throw new Error('stop');
				return left - right;
			})
		).toThrow('stop');
		flushSync();
		if (state.items.join(',') !== '3,2,1') expect(seen.at(-1)).toBe(state.items.join(','));
	});

	it('rejects conflicting key extractors registered for one collection', () => {
		const state = reactive({ records: [{ id: 'a', slug: 'first' }] });
		registerReactiveListKey(state.records, (item) => (item as { id: string }).id, 'Tasks.tsx:10');

		expect(() =>
			registerReactiveListKey(
				state.records,
				(item) => (item as { slug: string }).slug,
				'Sidebar.tsx:20'
			)
		).toThrow('Conflicting this.map() key extractors');
	});

	it('uses compiler key metadata instead of recreated function identity', () => {
		const state = reactive({ records: [{ id: 'a' }] });
		registerReactiveListKey(
			state.records,
			(item) => (item as { id: string }).id,
			'ListA',
			'member:id'
		);
		expect(() =>
			registerReactiveListKey(
				state.records,
				function differentSource(item) {
					return (item as { id: string }).id;
				},
				'ListB',
				'member:id'
			)
		).not.toThrow();
		expect(() =>
			registerReactiveListKey(
				state.records,
				(item) => (item as { id: string }).id,
				'ListC',
				'member:slug'
			)
		).toThrow('Conflicting this.map() key extractors');
	});

	it('rejects recreated dynamic extractors whose captured behavior disagrees', () => {
		const state = reactive({ records: [{ id: 'a', slug: 'first' }] });
		const extractor = (field: 'id' | 'slug') => (item: unknown) =>
			(item as { id: string; slug: string })[field];
		registerReactiveListKey(state.records, extractor('id'), 'ZList');

		expect(() => registerReactiveListKey(state.records, extractor('slug'), 'AList')).toThrow(
			'(AList and ZList)'
		);
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

	it('fails a self-invalidating reaction instead of looping forever', () => {
		const state = reactive({ count: 0 });
		let looping = true;
		const runs = vi.fn();
		watch(() => {
			runs();
			if (looping && state.count < 2_000) state.count++;
		});
		expect(() => flushSync()).toThrow('exceeded its flush limit');
		const before = runs.mock.calls.length;
		looping = false;
		state.count++;
		expect(() => flushSync()).not.toThrow();
		expect(runs.mock.calls.length).toBeGreaterThan(before);
	});

	it('tracks defineProperty writes, honors readonly mode, and rolls them back', () => {
		const state = reactive({ value: 1 });
		const seen: number[] = [];
		watch(() => seen.push(state.value));
		Object.defineProperty(state, 'value', {
			configurable: true,
			enumerable: true,
			writable: true,
			value: 2
		});
		flushSync();
		expect(seen).toEqual([1, 2]);
		expect(() =>
			batch(() => {
				Object.defineProperty(state, 'value', {
					configurable: true,
					enumerable: true,
					writable: true,
					value: 3
				});
				throw new Error('rollback');
			})
		).toThrow('rollback');
		expect(state.value).toBe(2);
		const readonly = reactive({ value: 1 }, { readonly: true });
		expect(() => Object.defineProperty(readonly, 'value', { value: 2 })).toThrow();
	});

	it('preserves postfix-update and array-mutator return semantics', () => {
		const state = reactive({ count: 1, items: ['a'] });
		expect(updateReactiveValue(state, ['count'], (previous) => Number(previous) + 1, true)).toBe(1);
		expect(state.count).toBe(2);
		expect(mutateReactiveArray(state, ['items'], 'push', ['b'])).toBe(2);
		expect(mutateReactiveArray(state, ['items'], 'pop', [])).toBe('b');
	});

	it('tracks reads and batches write notifications', () => {
		const state = reactive({ count: 0 });
		const render = vi.fn(() => void unwrap(state.count));

		watch(render);
		state.count = 1;
		state.count = 2;

		expect(render).toHaveBeenCalledTimes(1);
		flushSync();
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('does not run a stopped watcher that was already queued', () => {
		const state = reactive({ count: 0 });
		const seen: number[] = [];

		const stop = watch(() => {
			seen.push(Number(state.count));
		});

		state.count = 1;
		stop();
		flushSync();

		expect(seen).toEqual([0]);
	});

	it('reads with peek without tracking', () => {
		const state = reactive({ count: 0, ignored: 0 });
		const render = vi.fn(() => {
			void state.count;
			peek(() => state.ignored);
		});

		watch(render);
		state.ignored = 1;
		flushSync();

		expect(render).toHaveBeenCalledTimes(1);
	});

	it('keeps peek untracked across nested reaction collection', () => {
		const state = reactive({ visible: 0, ignored: 0 });
		const nested = vi.fn(() => state.ignored);
		let stopNested: (() => void) | undefined;
		const outer = vi.fn(() => {
			void state.visible;
			peek(() => {
				stopNested ??= watch(nested);
				// This read occurs after the nested reaction has returned and must not
				// leak back into the still-active outer reaction.
				void state.ignored;
			});
		});

		watch(outer);
		state.ignored++;
		flushSync();

		expect(outer).toHaveBeenCalledTimes(1);
		expect(nested).toHaveBeenCalledTimes(2);
		stopNested?.();
	});

	it('rolls back object writes and emits no notifications when a batch throws', () => {
		const state = reactive({ record: { title: 'Before', nested: { count: 1 } } });
		const record = state.record;
		const nested = state.record.nested;
		const observer = vi.fn(
			() => `${state.record.title}:${state.record.nested.count}:${'added' in state.record}`
		);
		watch(observer);

		expect(() =>
			batch(() => {
				state.record.title = 'After';
				state.record.nested.count = 2;
				(state.record as typeof state.record & { added?: boolean }).added = true;
				throw new Error('abort');
			})
		).toThrow('abort');
		flushSync();

		expect(state.record).toBe(record);
		expect(state.record.nested).toBe(nested);
		expect(state.record).toEqual({ title: 'Before', nested: { count: 1 } });
		expect(observer).toHaveBeenCalledTimes(1);
	});

	it('preserves identity for structurally equal writes and remains rollback-safe', () => {
		const state = reactive({ record: { title: 'Same' } });
		const record = state.record;

		expect(() =>
			batch(() => {
				state.record = { title: 'Same' };
				expect(state.record).toBe(record);
				throw new Error('abort');
			})
		).toThrow('abort');

		expect(state.record).toBe(record);
	});

	it('rolls back array mutators, length writes, and sparse holes', () => {
		const initial = new Array<string>(4);
		initial[1] = 'one';
		initial[3] = 'three';
		const state = reactive({ items: initial });
		const items = state.items;
		const observer = vi.fn(() => `${state.items.length}:${Reflect.ownKeys(state.items).join(',')}`);
		watch(observer);

		expect(() =>
			batch(() => {
				state.items.splice(0, 2, 'zero');
				state.items.length = 1;
				state.items.push('new');
				throw new Error('abort');
			})
		).toThrow('abort');
		flushSync();

		expect(state.items).toBe(items);
		expect(state.items.length).toBe(4);
		expect(0 in state.items).toBe(false);
		expect(state.items[1]).toBe('one');
		expect(2 in state.items).toBe(false);
		expect(state.items[3]).toBe('three');
		expect(observer).toHaveBeenCalledTimes(1);
	});

	it("rolls back a failed inner batch without discarding its parent's writes", () => {
		const state = reactive({ first: 0, second: 0, third: 0 });
		const seen: string[] = [];
		watch(() => seen.push(`${state.first}:${state.second}:${state.third}`));

		batch(() => {
			state.first = 1;
			try {
				batch(() => {
					state.second = 2;
					throw new Error('inner');
				});
			} catch {}
			state.third = 3;
		});
		flushSync();

		expect(state).toMatchObject({ first: 1, second: 0, third: 3 });
		expect(seen).toEqual(['0:0:0', '1:0:3']);
	});

	it('rolls back successful nested batches when the outer batch fails', () => {
		const state = reactive({ first: 0, second: 0 });
		const observer = vi.fn(() => `${state.first}:${state.second}`);
		watch(observer);

		expect(() =>
			batch(() => {
				state.first = 1;
				batch(() => {
					state.second = 2;
				});
				throw new Error('outer');
			})
		).toThrow('outer');
		flushSync();

		expect(state).toMatchObject({ first: 0, second: 0 });
		expect(observer).toHaveBeenCalledTimes(1);
	});

	it('rolls back compiler reconciliations while retaining nested proxy identity', () => {
		const state = reactive({
			project: { title: 'Before', owner: { name: 'Ada' } },
			records: [
				{ id: 'a', title: 'A' },
				{ id: 'b', title: 'B' }
			]
		});
		registerReactiveListKey(
			state.records,
			(item) => (item as { id: string }).id,
			'Records',
			'member:id'
		);
		const project = state.project;
		const owner = state.project.owner;
		const records = state.records;
		const first = state.records[0];

		expect(() =>
			batch(() => {
				writeReactive(state, ['project'], { title: 'After', owner: { name: 'Grace' } });
				writeReactive(
					state,
					['records'],
					[
						{ id: 'b', title: 'Changed' },
						{ id: 'a', title: 'A' }
					]
				);
				throw new Error('abort');
			})
		).toThrow('abort');

		expect(state.project).toBe(project);
		expect(state.project.owner).toBe(owner);
		expect(state.project).toEqual({ title: 'Before', owner: { name: 'Ada' } });
		expect(state.records).toBe(records);
		expect(state.records[0]).toBe(first);
		expect(state.records.map((record) => record.id)).toEqual(['a', 'b']);
		expect(state.records.map((record) => record.title)).toEqual(['A', 'B']);
	});

	it('returns raw primitives and snapshots reactive values', () => {
		const state = reactive({ query: 'abc', nested: { ok: true } });
		const source = ref(state.query);

		expect(source).toBeUndefined();
		expect(unwrap(state.query)).toBe('abc');
		expect(typeof state.query).toBe('string');
		expect(isReactive(state)).toBe(true);
		expect(snapshot(state)).toEqual({ query: 'abc', nested: { ok: true } });
	});

	it('supports normal equality comparisons for reactive primitives', () => {
		const state = reactive({ mode: 'compact', count: 1, enabled: true });

		expect(state.mode == 'compact').toBe(true);
		expect(state.count == 1).toBe(true);
		expect(state.enabled != false).toBe(true);
		expect(state.mode === 'compact').toBe(true);
	});

	it('caches computed values until dependencies change', () => {
		const state = reactive({ first: 'Ada', last: 'Lovelace' });
		const compute = vi.fn(() => `${state.first} ${state.last}`);
		const fullName = computed(compute);

		expect(unwrap(fullName)).toBe('Ada Lovelace');
		expect(unwrap(fullName)).toBe('Ada Lovelace');
		expect(compute).toHaveBeenCalledTimes(1);

		state.last = 'Byron';
		expect(unwrap(fullName)).toBe('Ada Byron');
		expect(compute).toHaveBeenCalledTimes(2);
	});

	it('retains a computed collection identity when recomputation is structurally equal', () => {
		const state = reactive({ revision: 0, items: [{ id: 'a', title: 'Same' }] });
		const items = computed(() => {
			void state.revision;
			return state.items.map((item) => ({ id: item.id, title: item.title }));
		});
		const first = items.get();

		state.revision++;
		flushSync();

		expect(items.get()).toBe(first);
	});

	it('tracks computed values that return reactive object references', () => {
		const state = reactive({ task: { title: 'First' } });
		const task = computed(() => state.task);
		const title = computed(() => task.get().title);
		const seen: string[] = [];
		const source = ref(title)!;

		subscribe(source, () => seen.push(source.get()));
		expect(unwrap(title)).toBe('First');

		state.task = { title: 'Second' };
		flushSync();

		expect(seen).toEqual(['Second']);
	});

	it('tracks nested fields read through computed readonly object props', () => {
		const state = reactive({ task: { title: 'First' } });
		const props = reactive(
			{ task: computed(() => state.task) as unknown as { title: string } },
			{ readonly: true }
		);
		const title = computed(() => props.task.title);
		const seen: string[] = [];
		const source = ref(title)!;

		subscribe(source, () => seen.push(source.get()));
		expect(unwrap(title)).toBe('First');

		state.task.title = 'Second';
		flushSync();

		expect(seen).toEqual(['Second']);
		expect(unwrap(title)).toBe('Second');
	});

	it('switches computed dependencies when conditional reads change', () => {
		const state = reactive({ useNickname: true, nickname: 'Ace', firstName: 'Ada' });
		const label = computed(() => (state.useNickname == true ? state.nickname : state.firstName));
		const seen: string[] = [];
		const source = ref(label)!;

		subscribe(source, () => seen.push(String(source.get())));
		expect(unwrap(label)).toBe('Ace');

		state.firstName = 'Augusta';
		flushSync();
		expect(seen).toEqual([]);

		state.useNickname = false;
		flushSync();
		expect(seen).toEqual(['Augusta']);

		state.nickname = 'Countess';
		flushSync();
		expect(seen).toEqual(['Augusta']);

		state.firstName = 'Ada';
		flushSync();
		expect(seen).toEqual(['Augusta', 'Ada']);
	});

	it('tracks object and array structural changes', () => {
		const state = reactive({
			user: { first: 'Ada' } as Record<string, string>,
			items: ['a', 'b']
		});
		const keys = computed(() => Object.keys(state.user).join(','));
		const list = computed(() => state.items.join(''));

		expect(unwrap(keys)).toBe('first');
		expect(unwrap(list)).toBe('ab');

		state.user.last = 'Lovelace';
		state.items.reverse();
		flushSync();

		expect(unwrap(keys)).toBe('first,last');
		expect(unwrap(list)).toBe('ba');
	});

	it('tracks direct array length truncation', () => {
		const state = reactive({ items: ['a', 'b', 'c'] });
		const list = computed(() => state.items.join(''));
		const seen: string[] = [];
		const source = ref(list)!;

		subscribe(source, () => seen.push(source.get()));
		expect(unwrap(list)).toBe('abc');

		state.items.length = 1;
		flushSync();

		expect(seen).toEqual(['a']);
		expect(unwrap(list)).toBe('a');
	});

	it('tracks array splice, sort, and reverse as structural changes', () => {
		const state = reactive({ items: ['c', 'a', 'b'] });
		const list = computed(() => state.items.join(''));
		const seen: string[] = [];
		const source = ref(list)!;

		subscribe(source, () => seen.push(source.get()));
		expect(unwrap(list)).toBe('cab');

		state.items.splice(1, 1, 'd');
		flushSync();
		state.items.sort();
		flushSync();
		state.items.reverse();
		flushSync();

		expect(seen).toEqual(['cdb', 'bcd', 'dcb']);
	});

	it('does not notify for structurally identical object replacement', () => {
		const state = reactive({ user: { name: 'Ada', roles: ['admin'] } });
		const seen: string[] = [];
		const label = computed(() => state.user.name);
		const source = ref(label)!;
		subscribe(source, () => seen.push(source.get()));

		state.user = { name: 'Ada', roles: ['admin'] };
		flushSync();
		expect(seen).toEqual([]);

		state.user = { name: 'Grace', roles: ['admin'] };
		flushSync();
		expect(seen).toEqual(['Grace']);
	});

	it('limits self-invalidating computed work and leaves the scheduler reusable', () => {
		const state = reactive({ count: 0, stable: 0 });
		const looping = computed(() => {
			if (state.count < 2_000) state.count++;
			return state.count;
		});
		looping.get();
		expect(() => flushSync()).toThrow('computation is repeatedly invalidating itself');

		const seen: number[] = [];
		watch(() => seen.push(state.stable));
		state.stable = 1;
		expect(() => flushSync()).not.toThrow();
		expect(seen).toEqual([0, 1]);
	});

	it('routes scheduler overflow through the owning effect scope', () => {
		const errors: unknown[] = [];
		const scope = createEffectScope(undefined, (error) => errors.push(error));
		const state = reactive({ count: 0 });
		withEffectScope(scope, () =>
			watch(() => {
				state.count++;
			})
		);
		expect(() => flushSync()).not.toThrow();
		expect(errors).toHaveLength(1);
		expect(String(errors[0])).toContain('scheduler exceeded its flush limit');
		scope.stop();
	});

	it('preserves an undefined scheduler failure and resets scheduled state', () => {
		const state = reactive({ failing: false, stable: 0 });
		watch(
			() => {
				if (state.failing) throw undefined;
			},
			undefined,
			{
				onError(error) {
					throw error;
				}
			}
		);
		state.failing = true;
		let caught = false;
		try {
			flushSync();
		} catch {
			caught = true;
		}
		expect(caught).toBe(true);
		state.failing = false;
		expect(() => flushSync()).not.toThrow();
	});

	it('distinguishes sparse arrays, prototypes, and alias topology', () => {
		const sparse = new Array(1);
		const dense = [undefined];
		const shared = {};
		const state = reactive({ version: 0 });
		const value = computed(() =>
			state.version === 0
				? { array: sparse, record: {}, pair: [shared, shared] }
				: { array: dense, record: Object.create(null), pair: [{}, {}] }
		);
		const notifications = vi.fn();
		subscribe(ref(value)!, notifications);
		value.get();
		state.version = 1;
		flushSync();
		expect(notifications).toHaveBeenCalledTimes(1);
	});

	it('tracks shared raw children through the accessed parent without broad invalidation', () => {
		const shared = { value: 1 };
		const state = reactive({ left: shared, right: shared });
		const left = vi.fn(() => state.left.value);
		const right = vi.fn(() => state.right.value);
		watch(left);
		watch(right);

		state.left = { value: 2 };
		flushSync();
		expect(left).toHaveBeenCalledTimes(2);
		expect(right).toHaveBeenCalledTimes(1);
		state.right.value = 2;
		flushSync();
		expect(right).toHaveBeenCalledTimes(2);
	});

	it('keeps retained shared-child aliases subscribed to their own parent paths', () => {
		const shared = { value: 1 };
		const state = reactive({ left: shared, right: shared });
		const leftAlias = state.left;
		const rightAlias = state.right;
		const left = vi.fn(() => leftAlias.value);
		const right = vi.fn(() => rightAlias.value);
		watch(left);
		watch(right);

		state.left = { value: 2 };
		flushSync();
		expect(left).toHaveBeenCalledTimes(2);
		expect(right).toHaveBeenCalledTimes(1);
	});

	it('keeps equivalent default proxy options canonical and incompatible options separate', () => {
		const raw = { value: 1 };
		expect(reactive(raw)).toBe(reactive(raw, {}));
		expect(reactive(raw, { readonly: true })).toBe(reactive(raw, { readonly: true }));
		expect(reactive(raw)).not.toBe(reactive(raw, { readonly: true }));
	});

	it('owns direct subscriptions in their scope and routes callback errors', () => {
		const state = reactive({ value: 0 });
		const source = ref(computed(() => state.value))!;
		const errors: unknown[] = [];
		const scope = createEffectScope(undefined, (error) => errors.push(error));
		withEffectScope(scope, () =>
			subscribe(source, () => {
				throw new Error('subscription');
			})
		);
		state.value = 1;
		expect(() => flushSync()).not.toThrow();
		expect(errors).toHaveLength(1);
		scope.stop();
		state.value = 2;
		flushSync();
		expect(errors).toHaveLength(1);
	});

	it('rejects new work in a stopped effect scope', () => {
		const scope = createEffectScope();
		scope.stop();
		expect(() => withEffectScope(scope, () => watch(() => undefined))).toThrow(
			'inactive effect scope'
		);
		expect(() => createEffectScope(scope)).toThrow('inactive parent scope');
	});

	it('stops deeply nested effect scopes without using the JavaScript call stack', () => {
		const root = createEffectScope();
		let cursor = root;
		for (let depth = 0; depth < 20_000; depth++) cursor = createEffectScope(cursor);

		expect(() => root.stop()).not.toThrow();
		expect(root.active).toBe(false);
		expect(cursor.active).toBe(false);
	});

	it('finishes scope teardown before rethrowing the first reaction stop failure', () => {
		const root = createEffectScope() as any;
		const child = createEffectScope(root) as any;
		const stopped: string[] = [];
		child.reactions.add({
			stop() {
				stopped.push('child-failure');
				throw new Error('stop failed');
			}
		});
		child.reactions.add({
			stop() {
				stopped.push('child-later');
			}
		});
		root.reactions.add({
			stop() {
				stopped.push('parent');
			}
		});

		expect(() => root.stop()).toThrow('stop failed');
		expect(stopped).toEqual(['child-failure', 'child-later', 'parent']);
		expect(root.active).toBe(false);
		expect(child.active).toBe(false);
		expect(root.children.size).toBe(0);
		expect(child.parent).toBeUndefined();
	});

	it('disposes a watcher whose first run throws before returning a stop handle', () => {
		const state = reactive({ value: 0 });
		const scope = createEffectScope();
		expect(() =>
			withEffectScope(scope, () =>
				watch(() => {
					void state.value;
					throw new Error('initial');
				})
			)
		).toThrow('initial');
		expect(() => {
			state.value = 1;
			flushSync();
		}).not.toThrow();
		scope.stop();
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
