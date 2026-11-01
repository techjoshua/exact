import { expect, it } from 'vitest';
import { reactive } from '../reactive.js';
import { watch } from '../observation.js';
import { flushSync } from '../internal/scheduler.js';
import { unwrap } from '../internal/values.js';
import { createPendingReactiveTransaction } from './pending-state.js';

for (const selection of ['get', 'values'] as const)
	for (const replace of [false, true])
		for (const reject of [false, true])
			it(`${selection} preserves pending ${replace ? 'replacement' : 'insertion'} member publication and ${reject ? 'rollback' : 'notification'}`, () => {
				const child = { count: 1 },
					previous = { count: 0 };
				const root = reactive({ map: new Map(replace ? [['x', previous]] : []), reject: 0 });
				const seen: number[] = [];
				const stop = watch(() => seen.push(reactive(child).count));
				const pending = createPendingReactiveTransaction(root);
				try {
					const map = pending.read(root, 'map') as object;
					pending.call(map, 'set', ['x', child]);
					const selected =
						selection === 'get'
							? pending.call(map, 'get', ['x'])
							: (pending.call(map, 'values', []) as Iterator<object>).next().value;
					pending.write(selected as object, 'count', 9);
					expect(child.count).toBe(1);
					expect(unwrap(root.map).get('x')).toBe(replace ? previous : undefined);
					expect(seen).toEqual([1]);
					if (reject) {
						pending.write(root, 'reject', 1);
						Object.defineProperty(unwrap(root), 'reject', {
							configurable: true,
							set() {
								throw Error('reject');
							}
						});
						expect(() => pending.commit()).toThrow('reject');
					} else pending.commit();
					flushSync();
					expect(child.count).toBe(reject ? 1 : 9);
					expect(seen).toEqual(reject ? [1] : [1, 9]);
					expect(unwrap(root.map).get('x')).toBe(reject ? (replace ? previous : undefined) : child);
				} finally {
					pending.discard();
					stop();
				}
			});

const selections = [
	{ kind: 'map', method: 'get', member: 'value' },
	{ kind: 'map', method: 'values', member: 'value' },
	{ kind: 'map', method: 'keys', member: 'key' },
	{ kind: 'map', method: 'entries', member: 'value' },
	{ kind: 'map', method: 'forEach', member: 'key' },
	{ kind: 'set', method: Symbol.iterator, member: 'value' },
	{ kind: 'set', method: 'entries', member: 'value' }
] as const;
for (const { kind, method, member } of selections)
	for (const order of ['early', 'late'] as const)
		it(`${kind} ${String(method)} ${member} associates ${order} acquired parent before descendant mutation`, () => {
			const child = { nested: { count: 1 } },
				key = { nested: { count: 1 } };
			const raw = kind === 'map' ? new Map([[key, child]]) : new Set([child]);
			const root = { raw, wrapped: reactive(raw) };
			const observed = member === 'key' ? key : child,
				seen: number[] = [];
			const stop = watch(() => seen.push(reactive(observed.nested).count));
			const pending = createPendingReactiveTransaction(root);
			try {
				if (order === 'early') pending.read(root, 'wrapped');
				const collection = pending.read(root, 'raw') as object;
				let selected: object;
				if (method === 'get') selected = pending.call(collection, method, [key]) as object;
				else if (method === 'forEach')
					pending.call(collection, method, [
						(value: object, entryKey: object) => {
							selected = member === 'key' ? entryKey : value;
						}
					]);
				else {
					const value = (pending.call(collection, method, []) as Iterator<object>).next().value!;
					selected = method === 'entries' ? (value as object[])[1]! : value;
				}
				const nested = pending.read(selected!, 'nested') as object;
				if (order === 'late') pending.read(root, 'wrapped');
				pending.write(nested, 'count', 9);
				expect(observed.nested.count).toBe(1);
				expect(seen).toEqual([1]);
				pending.commit();
				flushSync();
				expect(observed.nested.count).toBe(9);
				expect(seen).toEqual([1, 9]);
			} finally {
				pending.discard();
				stop();
			}
		});

// Consumed aliases outlive pending membership edits. Committed membership and each ordered
// publication can establish their receiver before mutation, including intermediate values.
for (const reject of [false, true])
	it(`retains both selected Map values across A-B-A publication with ${reject ? 'rollback' : 'notification'}`, () => {
		const a = { count: 1 },
			b = { count: 2 };
		const raw = new Map([['x', a]]),
			root = { raw, wrapped: reactive(raw), reject: 0 };
		const seenA: number[] = [],
			seenB: number[] = [];
		const stopA = watch(() => seenA.push(reactive(a).count));
		const stopB = watch(() => seenB.push(reactive(b).count));
		const pending = createPendingReactiveTransaction(root);
		try {
			pending.read(root, 'raw');
			const selectedA = pending.call(raw, 'get', ['x']) as object;
			pending.call(raw, 'set', ['x', b]);
			const selectedB = pending.call(raw, 'get', ['x']) as object;
			pending.call(raw, 'set', ['x', a]);
			pending.read(root, 'wrapped');
			pending.write(selectedA, 'count', 8);
			pending.write(selectedB, 'count', 9);
			expect(raw.get('x')).toBe(a);
			expect(a.count).toBe(1);
			expect(b.count).toBe(2);
			if (reject) {
				pending.write(root, 'reject', 1);
				Object.defineProperty(root, 'reject', {
					configurable: true,
					set() {
						throw Error('reject');
					}
				});
				expect(() => pending.commit()).toThrow('reject');
			} else pending.commit();
			flushSync();
			expect(raw.get('x')).toBe(a);
			expect(a.count).toBe(reject ? 1 : 8);
			expect(b.count).toBe(reject ? 2 : 9);
			expect(seenA).toEqual(reject ? [1] : [1, 8]);
			expect(seenB).toEqual(reject ? [2] : [2, 9]);
		} finally {
			pending.discard();
			stopA();
			stopB();
		}
	});

for (const kind of ['map', 'set'] as const)
	for (const operation of ['delete', 'clear'] as const)
		it(`${kind} pending ${operation} retains selected committed and intermediate member receivers`, () => {
			const a = { count: 1 },
				b = { count: 2 };
			const raw = kind === 'map' ? new Map([['x', a]]) : new Set([a]);
			const root = { raw, wrapped: reactive(raw) },
				seen: number[] = [];
			const stop = watch(() => seen.push(reactive(a).count + reactive(b).count));
			const pending = createPendingReactiveTransaction(root);
			try {
				pending.read(root, 'raw');
				const selectedA = (pending.call(raw, 'values', []) as Iterator<object>).next().value!;
				pending.call(raw, kind === 'map' ? 'set' : 'add', kind === 'map' ? ['x', b] : [b]);
				const selected = [...(pending.call(raw, 'values', []) as Iterable<object>)];
				const selectedB = selected.find((value) => unwrap(value) === b)!;
				pending.call(raw, operation, operation === 'delete' ? [kind === 'map' ? 'x' : b] : []);
				pending.read(root, 'wrapped');
				pending.write(selectedA, 'count', 8);
				pending.write(selectedB, 'count', 9);
				expect(a.count).toBe(1);
				expect(b.count).toBe(2);
				pending.commit();
				flushSync();
				expect(a.count).toBe(8);
				expect(b.count).toBe(9);
				expect(seen).toEqual([3, 17]);
				expect(raw.size).toBe(kind === 'set' && operation === 'delete' ? 1 : 0);
			} finally {
				pending.discard();
				stop();
			}
		});

for (const acquired of [false, true])
	for (const kind of ['map', 'set'] as const)
		it(`${kind} external detachment ${acquired ? 'preserves acquired' : 'cannot grant new'} receiver ownership`, () => {
			const child = { count: 1 };
			const raw = kind === 'map' ? new Map([['x', child]]) : new Set([child]);
			const root = { raw, wrapped: reactive(raw) },
				seen: number[] = [];
			const stop = watch(() => seen.push(reactive(child).count));
			const pending = createPendingReactiveTransaction(root);
			try {
				pending.read(root, 'raw');
				const selected = (pending.call(raw, 'values', []) as Iterator<object>).next().value!;
				if (acquired) pending.read(root, 'wrapped');
				raw.clear();
				if (!acquired) pending.read(root, 'wrapped');
				pending.write(selected, 'count', 9);
				expect(child.count).toBe(1);
				pending.commit();
				flushSync();
				expect(child.count).toBe(9);
				expect(raw.size).toBe(0);
				expect(seen).toEqual(acquired ? [1, 9] : [1]);
			} finally {
				pending.discard();
				stop();
			}
		});
