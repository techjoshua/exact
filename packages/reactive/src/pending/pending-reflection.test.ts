import { expect, it, vi } from 'vitest';
import { createPendingReactiveTransaction } from './pending-state.js';
import {
	pendingDescriptor,
	pendingOwnKeys,
	type PendingPropertyValue
} from './pending-reflection.js';

it.each(['commit', 'discard'] as const)(
	'reflects sparse truncation and regrowth without publishing before %s',
	(settle) => {
		const marker = Symbol('metadata');
		const values = Object.assign(['first', , 'removed'], { label: 'array', [marker]: 1 });
		const pending = createPendingReactiveTransaction(values);
		try {
			const view = pending.view(values);
			view.length = 1;
			view.length = 4;
			view[3] = 'new';
			expect(Reflect.ownKeys(view)).toEqual(['0', '3', 'length', 'label', marker]);
			expect(Object.getOwnPropertyDescriptor(view, 'length')).toEqual({
				value: 4,
				writable: true,
				enumerable: false,
				configurable: false
			});
			expect(Object.getOwnPropertyDescriptor(view, '2')).toBeUndefined();
			expect(2 in view).toBe(false);
			expect(Object.getOwnPropertyDescriptor(view, '3')?.value).toBe('new');
			expect(values.length).toBe(3);
			expect(values[2]).toBe('removed');
			expect(3 in values).toBe(false);
			pending[settle]();
			expect(values.length).toBe(settle === 'commit' ? 4 : 3);
			expect(2 in values).toBe(settle === 'discard');
			expect(3 in values).toBe(settle === 'commit');
			expect(values.label).toBe('array');
			expect(values[marker]).toBe(1);
			expect(() => Reflect.ownKeys(view)).toThrow('closed');
		} finally {
			pending.discard();
		}
	}
);

it('reflects staged deletion and preserves data attributes without evaluating accessors', () => {
	const getter = vi.fn(() => 'computed');
	const setter = vi.fn();
	const target = Object.defineProperties(
		{ removed: 1 },
		{
			hidden: { value: 2, enumerable: false, configurable: true, writable: true },
			accessor: { get: getter, set: setter, enumerable: true, configurable: true }
		}
	);
	const pending = createPendingReactiveTransaction(target);
	try {
		const view = pending.view(target);
		pending.remove(target, 'removed');
		pending.write(target, 'hidden', 3);
		expect(Reflect.ownKeys(view)).toEqual(['hidden', 'accessor']);
		expect(Object.getOwnPropertyDescriptor(view, 'removed')).toBeUndefined();
		expect(Object.getOwnPropertyDescriptor(view, 'hidden')).toEqual({
			value: 3,
			enumerable: false,
			configurable: true,
			writable: true
		});
		expect(Object.getOwnPropertyDescriptor(view, 'accessor')).toEqual(
			Object.getOwnPropertyDescriptor(target, 'accessor')
		);
		expect(getter).not.toHaveBeenCalled();
		expect(setter).not.toHaveBeenCalled();
		expect(Object.getOwnPropertyDescriptor(target, 'hidden')?.value).toBe(2);
	} finally {
		pending.discard();
	}
});

it('orders canonical indices before strings and symbols across pending reinsertion', () => {
	const first = Symbol('first');
	const last = Symbol('last');
	const target = { '8': 8, '01': 1, '-1': -1, '4294967295': 5, name: 0, [first]: 1 };
	const cells = new Map<PropertyKey, PendingPropertyValue>([
		[2, { value: 2 }],
		['8', { value: undefined, deleted: true }],
		['01', { value: 9, reinserted: true }],
		['', { value: 0 }],
		['1.5', { value: 1.5 }],
		[first, { value: 2, reinserted: true }],
		[last, { value: 3 }]
	]);
	const expected = { ...target } as Record<PropertyKey, unknown>;
	Reflect.set(expected, 2, 2);
	Reflect.deleteProperty(expected, '8');
	Reflect.deleteProperty(expected, '01');
	Reflect.set(expected, '01', 9);
	Reflect.set(expected, '', 0);
	Reflect.set(expected, '1.5', 1.5);
	Reflect.deleteProperty(expected, first);
	Reflect.set(expected, first, 2);
	Reflect.set(expected, last, 3);
	// Native enumeration supplies the oracle rather than encoding the helper's sorting steps.
	const before = Reflect.ownKeys(target);
	expect(pendingOwnKeys(target, cells)).toEqual(Reflect.ownKeys(expected));
	expect(Reflect.ownKeys(target)).toEqual(before);
});

it('preserves an accessor descriptor when a data cell is supplied without invoking it', () => {
	const get = vi.fn();
	const target = Object.defineProperty({}, 'value', { get, configurable: true });
	expect(pendingDescriptor(target, 'value', new Map([['value', { value: 9 }]]))).toEqual(
		Object.getOwnPropertyDescriptor(target, 'value')
	);
	expect(get).not.toHaveBeenCalled();
});
