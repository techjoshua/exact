import { describe, expect, it, vi } from 'vitest';
import { isJsonSafe as serverSafe, parseExactRequestBody } from './protocol.js';
import { isJsonSafe as clientSafe } from '../../hydrate/src/validation.js';

describe('JSON publication graph validation', () => {
	it.each([serverSafe, clientSafe])(
		'rejects hidden hooks and array accessors without execution',
		(validate) => {
			const hook = vi.fn(() => Infinity);
			for (const value of [
				Object.defineProperty({}, 'toJSON', { value: hook }),
				Object.defineProperty([], 'toJSON', { get: hook }),
				Object.defineProperty([0], '0', { get: hook, enumerable: false }),
				Object.defineProperty([0], '0', { value: Infinity, enumerable: false }),
				Object.defineProperty([0], Symbol.iterator, { get: hook }),
				Object.defineProperty([0], 'map', { get: hook }),
				Object.defineProperty(new Map([['safe', 0]]), Symbol.iterator, { get: hook }),
				Object.defineProperty(new Set([0]), 'toJSON', { get: hook })
			])
				expect(validate({ value })).toBe(false);
			expect(hook).not.toHaveBeenCalled();
		}
	);

	it.each([serverSafe, clientSafe])(
		'retains dense, hidden and sparse data with exact node budgets',
		(validate) => {
			for (const value of [
				['safe', 1, null],
				new Array(3),
				Object.defineProperty(['safe', 1, null], '0', { value: 'hidden', enumerable: false })
			]) {
				expect(validate(value, { maxNodes: 4 })).toBe(true);
				expect(validate(value, { maxNodes: 3 })).toBe(false);
			}
			expect(validate(new Array(1_000_000), { maxNodes: 10 })).toBe(false);
			expect(validate({ toJSON: 'data' })).toBe(true);
		}
	);

	it('rejects hidden input cells before request decoding', () => {
		const get = vi.fn(() => 'unsafe');
		const payload = Object.defineProperty([0], '0', { get, enumerable: false });
		expect(() => parseExactRequestBody({ type: 'invoke', id: 'save', payload })).toThrow();
		expect(get).not.toHaveBeenCalled();
	});
});
