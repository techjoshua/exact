import { expect, it } from 'vitest';
import { reactive, writeReactive } from './index.js';

it.each(['plain', 'reactive'] as const)(
	'creates an own undefined property in %s storage',
	(mode) => {
		const root: Record<string, unknown> = mode === 'plain' ? {} : reactive({});
		writeReactive(root, ['value'], undefined);
		expect(Object.hasOwn(root, 'value')).toBe(true);
		expect(root.value).toBeUndefined();
	}
);

it('creates an own property when an equal inherited value is assigned', () => {
	const root = Object.create({ value: 'same' });
	writeReactive(root, ['value'], 'same');
	expect(Object.hasOwn(root, 'value')).toBe(true);
});

it('preserves equality optimization on existing mutable own storage', () => {
	const root = reactive({ value: undefined });
	writeReactive(root, ['value'], undefined);
	expect(Object.hasOwn(root, 'value')).toBe(true);
});

it('rejects assignment to non-writable data even when the value is equal', () => {
	const root = Object.freeze({ value: 'same' });
	expect(() => writeReactive(root, ['value'], 'same')).toThrow(TypeError);
});

it.each(['missing', 'deleted'] as const)(
	'creates an own undefined indexed slot after %s storage',
	async (mode) => {
		const { indexedReactive } = await import('./indexed.js');
		const { writeIndexedReactiveValue, deleteIndexedReactiveValue } = await import('./writes.js');
		const state = indexedReactive<{ value?: unknown }>(['value']);
		if (mode === 'deleted') {
			writeIndexedReactiveValue(state, 0, 'before');
			deleteIndexedReactiveValue(state, 0);
		}
		writeIndexedReactiveValue(state, 0, undefined);
		expect(Object.hasOwn(state, 'value')).toBe(true);
		expect(state.value).toBeUndefined();
	}
);

it('preserves strict deletion failure on nonconfigurable data', async () => {
	const { deleteReactiveValue } = await import('./index.js');
	const root = Object.freeze({ value: 'before' });
	expect(() => deleteReactiveValue(root, ['value'])).toThrow(TypeError);
	expect(root.value).toBe('before');
});
