import { describe, expect, it } from 'vitest';
import { normalizeContinuationMap } from './config-validation.js';
import { commitStateForContract, mergeStateForContract } from './state.js';

const wildcardContract = {
	writes: [{ path: '*', kind: 'write' as const, confidence: 'exact' as const }]
};

describe('hydration protocol record safety', () => {
	it('rejects reserved continuation dictionary identities', () => {
		const value = JSON.parse(`{
			"__proto__": {
				"i": "task:save",
				"c": "component:app",
				"k": "task",
				"r": "nonblocking"
			}
		}`);

		expect(() => normalizeContinuationMap(value)).toThrow('Malformed eXact hydration continuation');
	});

	it('rejects reserved keys before wildcard state replacement or mutation', () => {
		const update = JSON.parse('{"safe":2,"nested":{"__proto__":{"polluted":true}}}');
		const target: Record<string, unknown> = { safe: 1 };
		const prototype = Object.getPrototypeOf(target);

		expect(mergeStateForContract(target, update, wildcardContract)).toEqual({ ok: false });
		commitStateForContract(target, update, wildcardContract);

		expect(target).toEqual({ safe: 1 });
		expect(Object.getPrototypeOf(target)).toBe(prototype);
	});
});
