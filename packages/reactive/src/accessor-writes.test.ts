import { expect, it } from 'vitest';
import { reactive, batch, watch, flushSync, computed } from './index.js';
import { indexedReactive } from './indexed.js';
import { indexedReactiveObjects } from './framework/indexed-objects.js';
import { writeReactive, writeIndexedReactiveValue } from './writes.js';

for (const mode of ['proxy', 'indexed', 'objects'] as const)
	it.each(['reverse', 'sort', 'fill', 'copyWithin', 'splice'] as const)(
		`observes retained accessor values after native %s writes (${mode})`,
		(method) => {
			let value = 1;
			const target = [1, 2];
			Object.defineProperty(target, '0', {
				configurable: true,
				get: () => value,
				set: (next: number) => {
					value = next;
				}
			});
			const owner =
				mode === 'objects'
					? indexedReactiveObjects<{ values: number[] }>(['values'])
					: indexedReactive<{ values: number[] }>(['values']);
			if (mode !== 'proxy') writeIndexedReactiveValue(owner, 0, target);
			const state = mode === 'proxy' ? reactive(target) : owner.values;
			const doubled = computed(() => state[0] * 2);
			const observed: number[] = [];
			const stop = watch(() => observed.push(doubled.get()));
			try {
				for (const next of [2, 3]) {
					state[1] = next;
					if (method === 'reverse') state.reverse();
					else if (method === 'sort') state.sort((a, b) => b - a);
					else if (method === 'fill') state.fill(next, 0, 1);
					else if (method === 'copyWithin') state.copyWithin(0, 1, 2);
					else state.splice(0, 1, next);
					flushSync();
					expect(observed.at(-1)).toBe(next * 2);
				}
			} finally {
				stop();
			}
		}
	);

it('notifies an accessor changed before a native setter throws', () => {
	let value = 1;
	const target = [1, 2];
	Object.defineProperty(target, '0', {
		configurable: true,
		get: () => value,
		set(next: number) {
			value = next;
			throw new Error('setter failed');
		}
	});
	const state = reactive(target);
	const observed: number[] = [];
	const stop = watch(() => observed.push(state[0]));
	try {
		expect(() => state.fill(4, 0, 1)).toThrow('setter failed');
		flushSync();
		expect(observed).toEqual([1, 4]);
	} finally {
		stop();
	}
});

it('observes repeated custom raw-receiver writes and stops disposed consumers', () => {
	class Values extends Array<number> {
		replace(value: number) {
			this[0] = value;
			return this;
		}
	}
	let value = 1;
	let reads = 0;
	const target = new Values(1);
	Object.defineProperty(target, '0', {
		configurable: true,
		get() {
			reads++;
			return value;
		},
		set(next: number) {
			value = next;
		}
	});
	const state = reactive(target);
	const observed: number[] = [];
	const stop = watch(() => observed.push(state[0]));
	try {
		for (const next of [2, 3]) {
			const before = reads;
			expect(state.replace(next)).toBe(state);
			expect(reads).toBe(before);
			flushSync();
			expect(observed.at(-1)).toBe(next);
		}
	} finally {
		stop();
	}
	state.replace(4);
	flushSync();
	expect(observed).toEqual([1, 2, 3]);
});

it('does not invalidate unchanged data slots after a native method', () => {
	const state = reactive([1, 2]);
	const observed: number[] = [];
	const stop = watch(() => observed.push(state[0]));
	try {
		state.fill(1, 0, 1);
		flushSync();
		expect(observed).toEqual([1]);
	} finally {
		stop();
	}
});

it('performs repeated accessor assignments without reading the getter', () => {
	let calls = 0;
	const target = {
		get value(): number {
			throw new Error('assignment must not read');
		},
		set value(_next: number) {
			calls++;
		}
	};
	const state = reactive({ target });
	writeReactive(state, ['target', 'value'], 1);
	writeReactive(state, ['target', 'value'], 1);
	state.target.value = 1;
	expect(calls).toBe(3);
});

it('observes array accessor writes without invoking indexed getters', () => {
	let calls = 0;
	const target: number[] = [];
	Object.defineProperty(target, '0', {
		configurable: true,
		get() {
			throw new Error('assignment must not read');
		},
		set(next: number) {
			calls++;
			this[1] = next;
		}
	});
	const state = reactive(target);
	const observed: unknown[] = [];
	const stop = watch(() => observed.push(state[1]));
	try {
		writeReactive(state, ['0'], 1);
		writeReactive(state, ['0'], 1);
		state[0] = 1;
		expect(calls).toBe(3);
		expect(state[1]).toBe(1);
		flushSync();
		expect(observed.at(-1)).toBe(1);
		expect(() =>
			batch(() => {
				state[0] = 4;
				throw new Error('rollback');
			})
		).toThrow('rollback');
		flushSync();
		expect(state[1]).toBe(1);
		expect(observed.at(-1)).toBe(1);
	} finally {
		stop();
	}
});

it('does not add indexed getter calls to authored array methods or rollback', () => {
	let reads = 0;
	class Values extends Array<number> {
		append(value: number) {
			this.push(value);
			return this;
		}
	}
	const target = new Values();
	Object.defineProperty(target, '0', {
		configurable: true,
		get() {
			reads++;
			return 10;
		}
	});
	const state = reactive(target);
	expect(state.append(20)).toBe(state);
	expect(reads).toBe(0);
	expect(() =>
		batch(() => {
			state.append(30);
			throw new Error('rollback');
		})
	).toThrow('rollback');
	expect(reads).toBe(0);
	expect(state.length).toBe(2);
	expect(state[1]).toBe(20);
});

it('preserves native mutation getter counts', () => {
	let reads = 0;
	const target = [1, 2];
	Object.defineProperty(target, '0', {
		configurable: true,
		get() {
			reads++;
			return 1;
		},
		set(next: number) {
			target[1] = next;
		}
	});
	const state = reactive(target);
	state.reverse();
	expect(reads).toBe(1);
	expect(state[1]).toBe(1);
});

it('publishes partial native writes without masking an authored setter failure', () => {
	let reads = 0;
	const target = [1, 2];
	Object.defineProperty(target, '0', {
		configurable: true,
		get() {
			reads++;
			return 1;
		},
		set(next: number) {
			target[1] = next + 10;
			throw new Error('authored failure');
		}
	});
	const state = reactive(target);
	const observed: unknown[] = [];
	const stop = watch(() => observed.push(state[1]));
	try {
		expect(() => state.reverse()).toThrow('authored failure');
		flushSync();
		expect(reads).toBe(1);
		expect(observed.at(-1)).toBe(12);
	} finally {
		stop();
	}
});

it('does not read an ordinary Array while recognizing indexed-state operands', () => {
	const target: number[] = [];
	Object.defineProperty(target, '0', {
		configurable: true,
		get() {
			throw new Error('operand inspection invoked getter');
		}
	});
	const state = indexedReactive<{ values: number[] }>(['values']);
	writeIndexedReactiveValue(state, 0, target);
	expect(state.values.length).toBe(1);
	writeIndexedReactiveValue(state, 0, target);
	expect(state.values.length).toBe(1);
});
