import { describe, expect, it, vi } from 'vitest';
import {
	computed,
	createEffectScope,
	decodeReactiveProtocolValue,
	encodeReactiveProtocolValue,
	flushSync,
	isReactive,
	peek,
	reactive,
	ref,
	registerReactiveListKey,
	snapshot,
	subscribe,
	unwrap,
	watch,
	withEffectScope,
	writeReactive
} from './index.js';
import { watchRetained } from './framework/watch.js';

describe('@exactjs/reactive observation', () => {
	it('returns ownership only while a watcher observes reactive dependencies', () => {
		const state = reactive({ value: 1 });
		const staticScope = createEffectScope();
		expect(watchRetained(() => undefined, undefined, { scope: staticScope })).toBeUndefined();

		const reactiveScope = createEffectScope();
		let observe = true;
		const stop = watchRetained(
			() => {
				if (observe) void state.value;
			},
			undefined,
			{ scope: reactiveScope }
		);
		expect(stop).toBeTypeOf('function');

		observe = false;
		state.value++;
		flushSync();
		expect((reactiveScope as unknown as { reactions: Set<unknown> }).reactions.size).toBe(0);
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

	it('preserves an own __proto__ data property without changing the snapshot prototype', () => {
		const value = JSON.parse('{"__proto__":{"polluted":true},"safe":1}') as Record<string, unknown>;
		const copy = snapshot(value);

		expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
		expect(Object.prototype.hasOwnProperty.call(copy, '__proto__')).toBe(true);
		expect(copy.__proto__).toEqual({ polluted: true });
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

	it('keeps class resources opaque through computed readonly object props', () => {
		class Resource {
			count = 0;
			increment(): void {
				this.count++;
			}
		}
		const resource = new Resource();
		const props = reactive(
			{ resource: computed(() => resource) as unknown as Resource },
			{ readonly: true }
		);

		expect(props.resource).toBe(resource);
		props.resource.increment();
		expect(resource.count).toBe(1);
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
});
