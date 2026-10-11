import { expect, it } from 'vitest';
import { KeyedVersionStore } from './keyed-version-store.js';

it('preserves generations and insertion order when a retained target gains more keys', () => {
	const versions = new KeyedVersionStore();
	const target = {};
	const symbol = Symbol('version');
	expect(versions.get(target, 'first')).toBe(0);
	expect(versions.has(target)).toBe(false);
	expect([...versions.keys(target)]).toEqual([]);
	expect(versions.retain(target, 'first')).toBe(0);
	versions.set(target, 'first', 7);
	expect(versions.retain(target, 'first')).toBe(7);
	expect(versions.retain(target, symbol)).toBe(0);
	expect(versions.get(target, 'first')).toBe(7);
	versions.set(target, symbol, 9);
	versions.set(target, 'first', 11);
	expect([...versions.keys(target)]).toEqual(['first', symbol]);
	expect(versions.get(target, symbol)).toBe(9);
	expect(versions.get(target, 'first')).toBe(11);
	expect(versions.get({}, 'first')).toBe(0);
});

it('keeps numeric and string keys distinct and supports ordinary prototype-looking names', () => {
	const versions = new KeyedVersionStore();
	const target = {};
	for (const [key, generation] of [
		[0, 1],
		['0', 2],
		['__proto__', 3]
	] as const)
		versions.set(target, key, generation);
	expect(versions.get(target, 0)).toBe(1);
	expect(versions.get(target, '0')).toBe(2);
	expect(versions.get(target, '__proto__')).toBe(3);
	expect([...versions.keys(target)]).toEqual([0, '0', '__proto__']);
});

it('preserves Map identity for NaN and signed zero before and after promotion', () => {
	const versions = new KeyedVersionStore();
	const target = {};
	versions.set(target, NaN, 3);
	expect(versions.get(target, NaN)).toBe(3);
	expect(versions.retain(target, NaN)).toBe(3);
	versions.set(target, -0, 4);
	expect(versions.get(target, 0)).toBe(4);
	expect(versions.get(target, NaN)).toBe(3);
});
