import { describe, expect, it, vi } from 'vitest';
import { isJsonSafe, jsonUnsafePath, renderHydrationScript } from './hydration.js';
import { validateJsonSafeHydrationValue } from './hydration-json.js';
import { registerReactiveListKey } from '@exactjs/reactive';

/** Creates hook-bearing containers whose ordinary enumerable contents remain valid JSON data. */
function hookValues(hook: () => unknown): object[] {
	return [
		Object.defineProperty({ value: 'safe' }, 'toJSON', { value: hook }),
		Object.defineProperty(['safe'], 'toJSON', { value: hook }),
		Object.defineProperty({ value: 'safe' }, 'toJSON', { get: hook }),
		Object.defineProperty(['safe'], 'toJSON', { get: hook }),
		new (class extends Array<string> {
			toJSON() {
				return hook();
			}
		})('safe')
	];
}

describe('hydration serialization hooks', () => {
	it('rejects hidden and inherited hooks before serialization can execute authored code', () => {
		const hook = vi.fn(() => ({ invalid: Infinity }));
		for (const value of hookValues(hook)) {
			const state = { value };
			expect(validateJsonSafeHydrationValue(state, {})).toBe('$.value');
			expect(jsonUnsafePath(state)).toBe('$.value');
			expect(isJsonSafe(state)).toBe(false);
			expect(() => renderHydrationScript({ state })).toThrow(/JSON-serializable/);
			expect(() => renderHydrationScript({}, undefined, [['Panel', [[0, value]]]])).toThrow(
				/JSON-serializable/
			);
		}
		expect(hook).not.toHaveBeenCalled();
	});

	it('validates every JSON array index, including hidden cells and bounded holes', () => {
		const hook = vi.fn(() => Infinity);
		const accessor = Object.defineProperty(['safe'], '0', { get: hook, enumerable: false });
		const number = Object.defineProperty(['safe'], '0', { value: Infinity, enumerable: false });
		const cycle: unknown[] = ['safe'];
		Object.defineProperty(cycle, '0', { value: cycle, enumerable: false });
		for (const value of [accessor, number, cycle]) {
			expect(validateJsonSafeHydrationValue(value, {})).toBe('$[0]');
			expect(jsonUnsafePath(value)).toBe('$[0]');
			expect(() => renderHydrationScript({ state: { value } })).toThrow(/JSON-serializable/);
		}
		const sparse = new Array(3);
		const hidden = Object.defineProperty(['safe'], '0', { value: 'hidden', enumerable: false });
		expect(validateJsonSafeHydrationValue(sparse, { maxNodes: 4 })).toBeUndefined();
		expect(validateJsonSafeHydrationValue(sparse, { maxNodes: 3 })).toBeDefined();
		expect(validateJsonSafeHydrationValue(hidden, { maxNodes: 2 })).toBeUndefined();
		expect(validateJsonSafeHydrationValue(hidden, { maxNodes: 1 })).toBeDefined();
		expect(validateJsonSafeHydrationValue(new Array(1_000_000), { maxNodes: 10 })).toBe('$');
		expect(hook).not.toHaveBeenCalled();
	});

	it('rejects array method and iterator hooks before keyed encoding can substitute items', () => {
		const hook = vi.fn(() => [{ id: 'injected' }]);
		for (const key of [Symbol.iterator, 'map', 'constructor']) {
			const rows = [{ id: 'safe' }];
			registerReactiveListKey(rows, (item) => (item as { id: string }).id, 'hooks', 'member:id');
			Object.defineProperty(rows, key, { get: hook });
			expect(() => renderHydrationScript({ state: { rows } })).toThrow(/JSON-serializable/);
			expect(jsonUnsafePath(rows)).toBe('$');
		}
		expect(hook).not.toHaveBeenCalled();
	});

	it('preserves inert toJSON data fields and unrelated non-enumerable accessors', () => {
		const get = vi.fn(() => 'unused');
		for (const value of [
			{ toJSON: 'ordinary data', value: 'safe' },
			Object.defineProperty(['safe'], 'toJSON', { value: null }),
			Object.defineProperty({ value: 'safe' }, 'unrelated', { get })
		]) {
			expect(validateJsonSafeHydrationValue(value, {})).toBeUndefined();
			expect(isJsonSafe(value)).toBe(true);
			const script = renderHydrationScript({ state: { value } });
			expect(JSON.parse(script.match(/>(.*)<\/script>/s)![1]!)).toEqual({
				state: { value: JSON.parse(JSON.stringify(value)) }
			});
		}
		expect(get).not.toHaveBeenCalled();
	});
});
