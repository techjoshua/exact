import { expect, it } from 'vitest';
import { reactive, batch, watch, flushSync } from './index.js';

it('preserves private brands, overridden calls and native storage rollback', () => {
	const calls: string[] = [];
	class Values extends Map<string, number> {
		#count = 0;
		get count() {
			return this.#count;
		}
		set count(value: number) {
			this.#count = value;
		}
		inspect() {
			return ++this.#count;
		}
		override set(key: string, value: number) {
			calls.push('set');
			this.#count++;
			return super.set(key, value);
		}
		override has(key: string) {
			calls.push('has');
			return super.has(key);
		}
		override get(key: string) {
			calls.push('get');
			return super.get(key);
		}
	}
	const values = reactive(new Values());
	expect(values.inspect()).toBe(1);
	values.count = 2;
	expect(values.count).toBe(2);
	expect(values.set('a', 1)).toBe(values);
	values.set('a', 1);
	expect(calls).toEqual(['set', 'set']);
	const observed: unknown[] = [];
	const stop = watch(() => observed.push(values.get('a')));
	try {
		values.set('a', 2);
		flushSync();
		expect(observed.at(-1)).toBe(2);
		expect(() =>
			batch(() => {
				values.set('a', 3);
				throw new Error('rollback');
			})
		).toThrow('rollback');
		flushSync();
		expect(values.get('a')).toBe(2);
		expect(observed.at(-1)).toBe(2);
	} finally {
		stop();
	}
});

it('forwards Array subclass methods and descriptors while observing public fields', () => {
	class Values extends Array<number> {
		#count = 0;
		calls = 0;
		get count() {
			return this.#count;
		}
		set count(value: number) {
			this.#count = value;
		}
		append(value: number) {
			this.#count++;
			this.calls++;
			this.push(value);
			return this;
		}
	}
	const values = reactive(new Values());
	const observed: number[] = [];
	const stop = watch(() => observed.push(values.calls + values.length));
	try {
		values.count = 2;
		expect(values.append(5)).toBe(values);
		flushSync();
		expect(values.count).toBe(3);
		expect(observed.at(-1)).toBe(2);
		expect(() =>
			batch(() => {
				values.append(6);
				throw new Error('rollback');
			})
		).toThrow('rollback');
		flushSync();
		expect([...values]).toEqual([5]);
		expect(values.calls).toBe(1);
	} finally {
		stop();
	}
});

it('observes collection storage changes made by branded accessors and restores ordering', () => {
	class Values extends Map<string, number> {
		#brand = true;
		set value(value: number) {
			if (this.#brand) super.set('a', value);
		}
		move() {
			const value = super.get('a')!;
			super.delete('a');
			super.set('a', value);
		}
	}
	const values = reactive(
		new Values([
			['a', 1],
			['b', 2]
		])
	);
	const observed: string[] = [];
	const stop = watch(() => observed.push([...values].map(([key, value]) => key + value).join(',')));
	try {
		values.value = 3;
		flushSync();
		expect(observed.at(-1)).toBe('a3,b2');
		expect(() =>
			batch(() => {
				values.move();
				throw new Error('rollback');
			})
		).toThrow('rollback');
		flushSync();
		expect(observed.at(-1)).toBe('a3,b2');
		values.move();
		flushSync();
		expect(observed.at(-1)).toBe('b2,a3');
	} finally {
		stop();
	}
});

it('invokes Set overrides on equal additions, absent deletions and empty clears', () => {
	const calls: string[] = [];
	class Values extends Set<number> {
		#brand = true;
		override add(value: number) {
			if (this.#brand) calls.push('add');
			return super.add(value);
		}
		override delete(value: number) {
			if (this.#brand) calls.push('delete');
			return super.delete(value);
		}
		override clear() {
			if (this.#brand) calls.push('clear');
			super.clear();
		}
	}
	const values = reactive(new Values());
	expect(values.add(1)).toBe(values);
	values.add(1);
	expect(values.delete(2)).toBe(false);
	values.clear();
	values.clear();
	expect(calls).toEqual(['add', 'add', 'delete', 'clear', 'clear']);
});

it('retains authored Array method identity and permits readonly inspection', () => {
	class Values extends Array<number> {
		#brand = 1;
		inspect() {
			return this.#brand + this.length;
		}
		append() {
			this.push(2);
		}
	}
	const values = reactive(new Values());
	expect(values.inspect).toBe(values.inspect);
	const readonly = reactive(new Values(), { readonly: true });
	expect(readonly.inspect()).toBe(1);
	expect(() => readonly.append()).toThrow('readonly');
	expect(readonly.length).toBe(0);
});

it('keeps objects returned by overridden Map readers observable', () => {
	class Rows extends Map<string, { count: number }> {
		override get(key: string) {
			return super.get(key);
		}
	}
	const rows = reactive(new Rows([['a', { count: 0 }]]));
	const observed: number[] = [];
	const stop = watch(() => observed.push(rows.get('a')!.count));
	try {
		rows.get('a')!.count++;
		flushSync();
		expect(observed.at(-1)).toBe(1);
		rows.set('a', { count: 2 });
		flushSync();
		expect(observed.at(-1)).toBe(2);
	} finally {
		stop();
	}
});

it('observes Array methods without invoking snapshot overrides or losing returned objects', () => {
	let slices = 0;
	let species = 0;
	class Values extends Array<{ count: number }> {
		#calls = 0;
		static get [Symbol.species]() {
			species++;
			return Array;
		}
		override slice(start?: number, end?: number) {
			slices++;
			return super.slice(start, end);
		}
		append() {
			this.#calls++;
			super.push({ count: this.#calls });
			return this[0];
		}
	}
	const state = reactive(new Values());
	const returned = state.append();
	const counts: number[] = [];
	const stop = watch(() => counts.push(returned.count));
	returned.count = 7;
	flushSync();
	expect.soft(counts).toEqual([1, 7]);
	expect(state[0].count).toBe(7);
	expect.soft(slices).toBe(0);
	expect.soft(species).toBe(0);
	stop();
});

it('keeps Map and Set public object members and branded getters observable', () => {
	class Rows extends Map<string, number> {
		details = { count: 0 };
		#details = { count: 0 };
		get privateDetails() {
			return this.#details;
		}
	}
	class Entries extends Set<number> {
		details = { count: 0 };
		#details = { count: 0 };
		get privateDetails() {
			return this.#details;
		}
	}
	for (const raw of [new Rows(), new Entries()]) {
		const state = reactive(raw);
		const counts: number[] = [];
		const stop = watch(() => counts.push(state.details.count + state.privateDetails.count));
		state.details.count++;
		state.privateDetails.count++;
		flushSync();
		expect.soft(counts).toEqual([0, 2]);
		stop();
	}
});
