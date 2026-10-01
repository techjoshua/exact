import { expect, it } from 'vitest';
import { reactive, batch, watch, flushSync } from './index.js';
import { indexedReactive } from './indexed.js';
import { writeReactive, writeIndexedReactiveValue } from './writes.js';

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
