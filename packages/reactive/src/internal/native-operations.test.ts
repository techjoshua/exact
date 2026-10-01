import { expect, it } from 'vitest';
import { isNativeAccessor, nativeMember, selectNativeOperation } from './native-operations.js';

it('selects native identity across aliases and subclasses while rejecting authored methods and wrong brands', () => {
	class Values extends Map<string, number> {
		get(key: string) {
			return super.get(key);
		}
	}
	const values = new Values();
	expect(selectNativeOperation(Map.prototype.get, values)).toEqual({ kind: 'map', key: 'get' });
	expect(selectNativeOperation(values.get, values)).toBeUndefined();
	expect(selectNativeOperation(Map.prototype.get, new Set())).toBeUndefined();
	expect(selectNativeOperation(Date.prototype.getTime, new Date())).toEqual({
		kind: 'date',
		key: 'getTime'
	});
	expect(selectNativeOperation(Array.prototype.push, [])).toEqual({ kind: 'array', key: 'push' });
});

it('recognizes accessor identity without executing an authored getter', () => {
	let reads = 0;
	class Values extends Map {
		get size() {
			reads++;
			return super.size;
		}
	}
	const authored = Object.getOwnPropertyDescriptor(Values.prototype, 'size')!.get;
	const native = Object.getOwnPropertyDescriptor(Map.prototype, 'size')!.get;
	expect(isNativeAccessor('map', 'size', native)).toBe(true);
	expect(isNativeAccessor('map', 'size', authored)).toBe(false);
	expect(isNativeAccessor('set', 'size', native)).toBe(false);
	expect(nativeMember('map', 'get')).toBe(Map.prototype.get);
	expect(nativeMember('map', 'size')).toBeUndefined();
	expect(reads).toBe(0);
});
