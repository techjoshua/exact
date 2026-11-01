import type { RefKey } from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { directSsrReadRef, directSsrRef, directSsrRefs, directSsrRoot } from './direct-refs.js';

const first = { id: Symbol('first'), description: 'first' } satisfies RefKey<object>;
const second = { id: Symbol('second'), description: 'second' } satisfies RefKey<object>;

describe('direct SSR refs', () => {
	it('retains binding identity and observes explicit fulfillment without reactive storage', () => {
		const owner = {};
		const binding = directSsrRef<object>(owner, first);
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
		const binding = directSsrRef<object>(owner, first);
		const root = directSsrRoot(owner, binding);
		expect(directSsrRoot(owner, binding)).toBe(root);
		expect(root.current).toBeUndefined();
		expect(() => directSsrRoot({}, binding)).toThrow(/owned/);
		expect(() => directSsrRoot(owner, directSsrRef<object>(owner, second))).toThrow(/only one/);
	});
	it('retains per-owner facade identity while allowing ordinary method aliases', () => {
		const owner = {};
		const refs = directSsrRefs(owner);
		const alias: { get(key: RefKey<unknown>): unknown } = refs;
		alias.get = () => 'replacement';
		expect(directSsrRefs(owner)).toBe(refs);
		expect(refs.get(first)).toBe('replacement');
		expect(directSsrRefs({}).get(first)).toBeUndefined();
	});
	it('keeps empty root observations as ordinary owner-local data', () => {
		const owner = {};
		const root = directSsrRoot(owner);
		const alias: { generation: number } = root;
		alias.generation = 7;
		expect(directSsrRoot(owner).generation).toBe(7);
		expect(directSsrRoot({}).generation).toBe(0);
	});
	it('does not transfer a framework binding when a writable owner alias changes', () => {
		const original = {};
		const foreign = {};
		const binding = directSsrRef<object>(original, first);
		const alias: { owner: object } = binding;
		alias.owner = foreign;
		expect(() => directSsrRoot(foreign, binding)).toThrow(/owned/);
		expect(directSsrRoot(original, binding)).toBe(binding);
	});
});
