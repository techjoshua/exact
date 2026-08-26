import { describe, expect, it } from 'vitest';
import type { RefKey } from '@exactjs/core';
import { directSsrReadRef, directSsrRef, directSsrRoot } from './direct-refs.js';

const first = { id: Symbol('first'), description: 'first' } satisfies RefKey<object>;
const second = { id: Symbol('second'), description: 'second' } satisfies RefKey<object>;

describe('direct SSR refs', () => {
	it('retains binding identity and observes explicit fulfillment without reactive storage', () => {
		const owner = {};
		const binding = directSsrRef(owner, first);
		expect(directSsrRef(owner, first)).toBe(binding);
		expect(directSsrReadRef(owner, first)).toBeUndefined();

		const value = {};
		binding.fulfill(value);
		expect(directSsrReadRef(owner, first)).toBe(value);
	});

	it('exposes a stable empty intrinsic-root lifecycle during SSR', () => {
		const owner = {};
		const root = directSsrRoot(owner);
		expect(directSsrRoot(owner)).toBe(root);
		expect(root).toEqual({
			current: undefined,
			generation: 0,
			introduction: undefined,
			presented: false,
			release: undefined
		});
	});

	it('augments one owned binding and rejects cross-owner or competing roots', () => {
		const owner = {};
		const binding = directSsrRef(owner, first);
		const root = directSsrRoot(owner, binding);
		expect(directSsrRoot(owner, binding)).toBe(root);
		expect(root.current).toBeUndefined();
		expect(() => directSsrRoot({}, binding)).toThrow(/owned/);
		expect(() => directSsrRoot(owner, directSsrRef(owner, second))).toThrow(/only one/);
	});
});
