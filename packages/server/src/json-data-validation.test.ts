import { describe, expect, it, vi } from 'vitest';
import { isJsonSafe as serverSafe, parseExactRequestBody } from './protocol.js';
import { isJsonSafe as clientSafe } from '../../hydrate/src/validation.js';
import { encodeReactiveProtocolValue } from '@exactjs/core';
import { handleExactRequest } from './index.js';
import { exactResponseToFetchResponse } from './adapters.js';
import { context } from './test-support/server.js';

describe('JSON publication graph validation', () => {
	it.each([serverSafe, clientSafe])(
		'accepts shared siblings while bounding every serialized occurrence',
		(validate) => {
			const shared = { count: 1 };
			const value = { left: shared, right: shared };
			// Sharing siblings is serializable. Only a reference to an active ancestor is a cycle.
			expect(validate(value, { maxNodes: 5, maxDepth: 2, maxBytes: 19 })).toBe(true);
			expect(validate(value, { maxNodes: 4 })).toBe(false);
			expect(validate(value, { maxDepth: 1 })).toBe(false);
			expect(validate(value, { maxBytes: 18 })).toBe(false);
			for (const graph of [
				[shared, shared],
				{ left: shared, right: shared },
				{ shallow: shared, deep: { rows: [null, { shared }, 0] }, empty: {} },
				new Map([
					['a', shared],
					['b', shared]
				]),
				new Set([{ shared }, { shared }])
			]) {
				expect(validate(graph)).toBe(true);
				expect(validate(encodeReactiveProtocolValue(graph))).toBe(true);
			}
			for (const graph of [
				new Map([
					['a', shared],
					['b', shared]
				]),
				new Set([{ shared }, { shared }])
			]) {
				expect(validate(graph, { maxNodes: graph instanceof Map ? 5 : 7 })).toBe(true);
				expect(validate(graph, { maxNodes: graph instanceof Map ? 4 : 6 })).toBe(false);
			}
		}
	);
	it('accepts shared raw request data and rejects a true request cycle', () => {
		const shared = { count: 1 };
		const payload = { left: shared, right: shared };
		expect(parseExactRequestBody({ type: 'invoke', id: 'allowed-action', payload })).toMatchObject({
			payload
		});
		const cycle: Record<string, unknown> = {};
		cycle.self = cycle;
		expect(() =>
			parseExactRequestBody({ type: 'invoke', id: 'allowed-action', payload: cycle })
		).toThrow('request graph limit');
	});

	it.each([serverSafe, clientSafe])(
		'rejects object, array, Map and Set ancestor cycles after shared siblings',
		(validate) => {
			const object: Record<string, unknown> = {};
			object.self = object;
			const indirect: Record<string, unknown> = {};
			indirect.child = { rows: [0, { ancestor: indirect }] };
			const array: unknown[] = [];
			array.push(array);
			const map = new Map<string, unknown>();
			map.set('self', map);
			const set = new Set<unknown>();
			set.add(set);
			const shared = { count: 1 };
			for (const cyclic of [object, indirect, array, map, set])
				expect(validate({ first: shared, second: shared, cyclic })).toBe(false);
		}
	);

	it('returns ordinary shared handler data through the public request boundary', async () => {
		const shared = { count: 1 };
		const value = { left: shared, right: shared };
		const response = await handleExactRequest(
			{ method: 'POST', body: { type: 'invoke', id: 'allowed-action' } },
			context({ invocations: { 'allowed-action': () => ({ value }) } })
		);
		expect(response.status).toBe(200);
		expect((await exactResponseToFetchResponse(response).json()).value).toEqual(value);
	});
	it.each([serverSafe, clientSafe])(
		'rejects hidden hooks and array accessors without execution',
		(validate) => {
			const hook = vi.fn(() => Infinity);
			for (const value of [
				Object.defineProperty({}, 'toJSON', { value: hook }),
				Object.defineProperty([], 'toJSON', { get: hook }),
				Object.defineProperty([0], '0', { get: hook, enumerable: false }),
				Object.defineProperty([0], '0', { value: Symbol('unsupported'), enumerable: false }),
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
