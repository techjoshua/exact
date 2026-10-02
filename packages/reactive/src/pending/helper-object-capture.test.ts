import { expect, it } from 'vitest';
import { createPendingReactiveHelperObject } from './helper-object-capture.js';

it('captures symbol-producing names once and pairs computed accessors', () => {
	const capture = createPendingReactiveHelperObject([undefined, undefined]);
	let coercions = 0;
	const key = Symbol('value');
	const input = { [Symbol.toPrimitive]: () => (coercions++, key) };
	const object = {
		get [capture.key(0, input, 'get')]() {
			return 1;
		},
		set [capture.key(1, key, 'set')](_value: number) {}
	};
	expect(coercions).toBe(1);
	expect(capture.selected(0)).toBe(true);
	expect(capture.selected(1)).toBe(true);
	expect(Object.getOwnPropertyDescriptor(object, key)?.get).toBeTypeOf('function');
});

it('rejects overwritten companion ownership while retaining the final accessor pair', () => {
	const capture = createPendingReactiveHelperObject([
		['value', 'get'],
		['value', 'set'],
		['value', 'value'],
		undefined,
		undefined
	]);
	capture.key(3, 'value', 'get');
	capture.key(4, 'value', 'set');
	expect([0, 1, 2, 3, 4].map((index) => capture.selected(index))).toEqual([
		false,
		false,
		false,
		true,
		true
	]);
});

it('preserves native proxy spread order, getter receiver and enumerability', () => {
	const events: string[] = [];
	const receiver = {
		get value() {
			expect(this).toBe(receiver);
			events.push('getter');
			return undefined;
		}
	};
	Object.defineProperty(receiver, 'hidden', { value: 1 });
	const source = new Proxy(receiver, {
		ownKeys(target) {
			events.push('keys');
			return Reflect.ownKeys(target);
		},
		getOwnPropertyDescriptor(target, key) {
			events.push(`descriptor:${String(key)}`);
			return Reflect.getOwnPropertyDescriptor(target, key);
		},
		get(target, key, selected) {
			events.push(`get:${String(key)}`);
			return Reflect.get(target, key, selected === source ? target : selected);
		}
	});
	const reference = { ...source };
	const expected = [...events];
	events.length = 0;
	const capture = createPendingReactiveHelperObject([
		['value', 'get'],
		['hidden', 'get'],
		undefined
	]);
	const copied = { ...capture.spread(2, source) };
	expect(copied).toEqual(reference);
	expect(events).toEqual(expected);
	expect(capture.selected(0)).toBe(false);
	expect(capture.selected(1)).toBe(true);
});

it('retains nullish and primitive spread behavior', () => {
	const capture = createPendingReactiveHelperObject([undefined, undefined, undefined]);
	expect(capture.spread(0, null)).toBeNull();
	expect(capture.spread(1, undefined)).toBeUndefined();
	expect({ ...(capture.spread(2, 'ab') as unknown as Record<string, unknown>) }).toEqual({
		0: 'a',
		1: 'b'
	});
});
