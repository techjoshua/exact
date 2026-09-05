import { describe, expect, it, vi } from 'vitest';
import {
	batch,
	captureReactiveMutations,
	computed,
	createEffectScope,
	flushSync,
	inspectComputed,
	peek,
	publishBatch,
	ref,
	reactive,
	watch,
	withEffectScope
} from './index.js';

describe('@exactjs/reactive computation graph', () => {
	it('retains bound reads and ordinary value conversions', () => {
		const value = computed(() => 7);
		const read = value.get;

		expect(read()).toBe(7);
		expect(value.toJSON()).toBe(7);
		expect(value.toString()).toBe('7');
		expect(value.valueOf()).toBe(7);
		expect(`${value}`).toBe('7');
		expect(Object.hasOwn(value, 'toJSON')).toBe(true);
		expect(Object.hasOwn(value, 'toString')).toBe(true);
		expect(Object.hasOwn(value, 'valueOf')).toBe(true);
		expect(Object.hasOwn(value, Symbol.toPrimitive)).toBe(true);
		const source = ref(value);
		expect(source.get()).toBe(7);
		expect(() => source.set(8)).toThrow('Cannot write to readonly reactive value');
	});

	it('returns a current value through a transitive chain before scheduler settlement', () => {
		const state = reactive({ value: 1 });
		const calculateDoubled = vi.fn(() => state.value * 2);
		const doubled = computed(calculateDoubled);
		const label = computed(() => `value:${doubled.get()}`);

		expect(label.get()).toBe('value:2');
		state.value = 2;
		expect(calculateDoubled).toHaveBeenCalledTimes(1);

		expect(label.get()).toBe('value:4');
		expect(calculateDoubled).toHaveBeenCalledTimes(2);
	});

	it('reads writes inside a batch and invalidates a value sampled before rollback', () => {
		const state = reactive({ value: 1 });
		const doubled = computed(() => state.value * 2);
		const label = computed(() => `value:${doubled.get()}`);
		expect(label.get()).toBe('value:2');

		expect(() =>
			batch(() => {
				state.value = 2;
				expect(label.get()).toBe('value:4');
				throw new Error('rollback');
			})
		).toThrow('rollback');

		expect(label.get()).toBe('value:2');
	});

	it('restores a watched cache sampled inside a failed batch', () => {
		const state = reactive({ value: 1 });
		const doubled = computed(() => state.value * 2);
		const seen: number[] = [];
		const stop = watch(() => seen.push(doubled.get()));

		expect(() =>
			batch(() => {
				state.value = 2;
				expect(doubled.get()).toBe(4);
				throw new Error('rollback');
			})
		).toThrow('rollback');

		expect(doubled.get()).toBe(2);
		expect(seen).toEqual([2]);
		stop();
	});

	it('samples current values across publication batches and optimistic rollback', () => {
		const state = reactive({ value: 1 });
		const calculateDoubled = vi.fn(() => state.value * 2);
		const doubled = computed(calculateDoubled);
		const label = computed(() => `value:${doubled.get()}`);
		expect(label.get()).toBe('value:2');
		const stop = watch(() => label.get());

		publishBatch(() => {
			state.value = 2;
			expect(label.get()).toBe('value:4');
		});
		flushSync();
		expect(calculateDoubled).toHaveBeenCalledTimes(2);
		const journal = captureReactiveMutations(() => {
			state.value = 3;
		});
		expect(label.get()).toBe('value:6');

		journal.rollback();
		expect(label.get()).toBe('value:4');
		stop();
	});

	it('uses equal intermediate results as a downstream propagation barrier', () => {
		const state = reactive({ value: 1 });
		const parity = computed(() => state.value % 2);
		const renderLabel = vi.fn(() => `parity:${parity.get()}`);
		const label = computed(renderLabel);
		const publish = vi.fn(() => label.get());
		const stop = watch(publish);

		state.value = 3;
		flushSync();

		expect(renderLabel).toHaveBeenCalledTimes(1);
		expect(publish).toHaveBeenCalledTimes(1);
		stop();
	});

	it('reports direct and indirect cycles without exhausting the JavaScript stack', () => {
		const directCycle = {} as { value: ReturnType<typeof computed<number>> };
		directCycle.value = computed(() => directCycle.value.get());
		expect(() => directCycle.value.get()).toThrow('eXact reactive computation cycle detected');

		const indirectCycle = {} as {
			left: ReturnType<typeof computed<number>>;
			right: ReturnType<typeof computed<number>>;
		};
		indirectCycle.left = computed(() => indirectCycle.right.get() + 1);
		indirectCycle.right = computed(() => indirectCycle.left.get() + 1);
		expect(() => indirectCycle.left.get()).toThrow('eXact reactive computation cycle detected');
	});

	it('settles a deep initialized chain without recursive graph traversal', () => {
		const state = reactive({ value: 0 });
		const scope = createEffectScope();
		let current = withEffectScope(scope, () => computed(() => state.value));
		withEffectScope(scope, () => {
			expect(current.get()).toBe(0);
			for (let index = 0; index < 5_000; index++) {
				const source = current;
				current = computed(() => source.get() + 1);
				expect(current.get()).toBe(index + 1);
			}
		});

		state.value = 1;
		expect(current.get()).toBe(5_001);
		scope.stop();
	});

	it('attaches reverse edges only while a standalone computed is watched', () => {
		const state = reactive({ value: 1 });
		const source = computed(() => state.value * 2);
		const downstream = computed(() => source.get() + 1);

		expect(downstream.get()).toBe(3);
		expect(inspectComputed(source)).toMatchObject({ observed: false, sinks: 0 });

		const stop = watch(() => downstream.get());
		expect(inspectComputed(source)).toMatchObject({ observed: true, sinks: 1 });
		stop();

		expect(inspectComputed(source)).toMatchObject({ observed: false, sinks: 0 });
	});

	it('replaces computed branch edges and excludes values read through peek', () => {
		const state = reactive({ left: 1, right: 2, useLeft: true });
		const left = computed(() => state.left);
		const right = computed(() => state.right);
		const selected = computed(() => (state.useLeft ? left.get() : right.get()));
		const untracked = computed(() => peek(() => selected.get()));
		const stop = watch(() => selected.get());

		expect(inspectComputed(left)).toMatchObject({ sinks: 1 });
		expect(inspectComputed(right)).toMatchObject({ sinks: 0 });
		expect(untracked.get()).toBe(1);
		expect(inspectComputed(selected)).toMatchObject({ sinks: 0 });

		state.useLeft = false;
		flushSync();
		expect(inspectComputed(left)).toMatchObject({ sinks: 0 });
		expect(inspectComputed(right)).toMatchObject({ sinks: 1 });
		stop();
	});

	it('exposes bounded status and releases a scope-owned computation', () => {
		const state = reactive({ value: 1 });
		const scope = createEffectScope();
		const value = withEffectScope(scope, () => computed(() => state.value * 2));
		expect(value.get()).toBe(2);
		expect(inspectComputed(value)).toMatchObject({
			state: 'clean',
			initialized: true,
			sources: 1
		});

		scope.stop();
		expect(inspectComputed(value)).toMatchObject({ state: 'stopped', sinks: 0 });
	});

	it('inspects dirty, checked, paused, and failed computation states', () => {
		const errors: unknown[] = [];
		const state = reactive({ value: 1, fail: false });
		const scope = createEffectScope(undefined, (error) => errors.push(error));
		let source!: ReturnType<typeof computed<number>>;
		let downstream!: ReturnType<typeof computed<number>>;
		withEffectScope(scope, () => {
			source = computed(() => {
				if (state.fail) throw new Error('failed');
				return state.value * 2;
			});
			downstream = computed(() => source.get() + 1);
		});
		expect(downstream.get()).toBe(3);

		state.value = 2;
		expect(inspectComputed(source)).toMatchObject({ state: 'dirty' });
		expect(inspectComputed(downstream)).toMatchObject({ state: 'checked' });
		scope.pause();
		expect(inspectComputed(source)).toMatchObject({ state: 'paused' });
		scope.resume();
		flushSync();

		state.fail = true;
		flushSync();
		expect(errors).toHaveLength(1);
		expect(inspectComputed(source)).toMatchObject({ state: 'failed' });
		scope.stop();
	});
});
