import { it, expect } from 'vitest';
import {
	batch,
	reactive,
	captureReactiveMutations,
	watch,
	flushSync,
	computed,
	unwrap,
	inspectComputed
} from '../index.js';
const orders = [
	[0, 1, 2],
	[0, 2, 1],
	[1, 0, 2],
	[1, 2, 0],
	[2, 0, 1],
	[2, 1, 0]
];
for (const mode of ['push', 'unshift', 'splice-insert', 'pop', 'shift'] as const)
	for (const order of orders)
		it(`${mode} rollback ${order}`, () => {
			const items = reactive(['a', 'b', 'c', 'd']);
			const journals = [1, 2, 3].map(() =>
				captureReactiveMutations(() => {
					if (mode === 'push') items.push('same');
					if (mode === 'unshift') items.unshift('same');
					if (mode === 'splice-insert') items.splice(1, 0, 'same');
					if (mode === 'pop') items.pop();
					if (mode === 'shift') items.shift();
				})
			);
			for (const i of order) journals[i]!.rollback();
			expect(items).toEqual(['a', 'b', 'c', 'd']);
		});
it('moves pending property inverses and invalidates numeric observers', () => {
	const items = reactive(['base']);
	const joined = computed(() => items.join(','));
	expect(unwrap(joined)).toBe('base');
	const seen: string[] = [];
	const stop = watch(() => {
		seen.push(items[1] ?? 'missing');
	});
	try {
		const a = captureReactiveMutations(() => items.push('a'));
		items.push('b');
		const b = captureReactiveMutations(() => {
			items[2] = 'edited';
		});
		flushSync();
		a.rollback();
		flushSync();
		expect(items).toEqual(['base', 'edited']);
		expect(seen.at(-1)).toBe('edited');
		b.rollback();
		flushSync();
		expect(items).toEqual(['base', 'b']);
		expect(seen.at(-1)).toBe('b');
		const c = captureReactiveMutations(() => items.push('c'));
		const d = captureReactiveMutations(() => items.push('c'));
		c.rollback();
		const e = captureReactiveMutations(() => items.push('c'));
		d.rollback();
		e.rollback();
		expect(items).toEqual(['base', 'b']);
		flushSync();
		expect(unwrap(joined)).toBe('base,b');
	} finally {
		stop();
	}
});

it('rolls back a truncation before removing an older rejected insertion', () => {
	const items = reactive(['b']);
	const first = captureReactiveMutations(() => items.unshift('a'));
	const second = captureReactiveMutations(() => {
		items.length = 0;
	});
	first.rollback();
	second.rollback();
	expect(items).toEqual(['b']);
	items.reverse();
	items.push('next');
	expect(items).toEqual(['b', 'next']);
});

it('restores a reordered suffix after another rollback removes its unchanged prefix', () => {
	const items = reactive(['c', 'b']);
	const prefix = captureReactiveMutations(() => items.unshift('a'));
	const order = captureReactiveMutations(() => items.sort());
	prefix.rollback();
	order.rollback();
	expect(items).toEqual(['c', 'b']);
});

it.each(['reverse', 'sort'] as const)('removes rejected insertions after ordinary %s', (method) => {
	const items = reactive(['b', 'c']);
	const journal = captureReactiveMutations(() => items.push('a'));
	items[method]();
	journal.rollback();
	expect(items).toEqual(method === 'reverse' ? ['c', 'b'] : ['b', 'c']);
	const next = captureReactiveMutations(() => items.push('next'));
	next.rollback();
	expect(items).toEqual(method === 'reverse' ? ['c', 'b'] : ['b', 'c']);
});

for (const order of orders)
	it(`restores entry identity across overlapping insertion, reversal, and sort: ${order}`, () => {
		const items = reactive(['c', 'b']);
		const journals = [
			captureReactiveMutations(() => items.push('a')),
			captureReactiveMutations(() => items.reverse()),
			captureReactiveMutations(() => items.sort())
		];
		for (const index of order) journals[index]!.rollback();
		expect(items).toEqual(['c', 'b']);
	});

it('restores a moved property without replacing later authoritative entry writes', () => {
	const items = reactive(['b', 'c']);
	const first = captureReactiveMutations(() => {
		items[0] = 'optimistic';
	});
	items.reverse();
	first.rollback();
	expect(items).toEqual(['c', 'b']);
	const second = captureReactiveMutations(() => {
		items[0] = 'optimistic';
	});
	items.reverse();
	items[1] = 'authoritative';
	second.rollback();
	expect(items).toEqual(['b', 'authoritative']);
});

it('retains duplicate occurrences, holes, and undefined values through sorting and rollback', () => {
	const items = reactive(['b', , undefined, 'a', 'a']);
	const journal = captureReactiveMutations(() => items.unshift('a', undefined));
	items.sort();
	journal.rollback();
	expect(items).toEqual(['a', 'a', 'b', undefined, ,]);
	expect(4 in items).toBe(false);
});

it('keeps a later ordinary order when an earlier optimistic reorder is rejected', () => {
	const items = reactive([3, 1, 2]);
	const journal = captureReactiveMutations(() => items.reverse());
	items.sort((left, right) => left - right);
	journal.rollback();
	expect(items).toEqual([1, 2, 3]);
});

import {
	arrayPosition,
	arrayPositionKey,
	hasArrayPositions,
	type ArrayPosition
} from './positions.js';
import { readOwnershipVersion } from '../internal/deps.js';
const BASE = 'C-base',
	OPT = 'C-optimistic',
	LATER = 'C-independent';
const describeValue = (value: unknown) => (value === undefined ? { undefined: true } : value);
function caught(action: () => void) {
	let didCatch = false;
	let reason: unknown;
	try {
		action();
	} catch (error) {
		didCatch = true;
		reason = error;
	}
	return { didCatch, reason };
}
function failureRecord(value: ReturnType<typeof caught>) {
	return { didCatch: value.didCatch, reason: describeValue(value.reason) };
}
function snapshot(items: string[]) {
	return {
		values: Array.from(items, describeValue),
		length: items.length,
		keys: Object.keys(items)
	};
}
function sameArray(left: string[], right: string[]) {
	return (
		left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
	);
}

it('R1 observes reentrant authority through two real journals, opposites and following progress', () => {
	const rows: Record<string, unknown>[] = [];
	for (const mode of ['unarmed', 'reentrant', 'before-clear'] as const) {
		const raw = ['A', 'B', BASE];
		let armed = false,
			fired = false;
		let restoredPosition: ArrayPosition | undefined;
		const events: Record<string, unknown>[] = [];
		let reentry: Record<string, unknown> | undefined;
		const wrapped = new Proxy(raw, {
			set(target, key, value) {
				if (armed) events.push({ phase: 'set', key: String(key), value: describeValue(value) });
				return Reflect.set(target, key, value, target);
			},
			defineProperty(target, key, descriptor) {
				const success = Reflect.defineProperty(target, key, descriptor);
				if (armed) {
					events.push({
						phase: 'define',
						key: String(key),
						value: describeValue(descriptor.value),
						success
					});
					if (mode === 'reentrant' && !fired && success && descriptor.value === 'B') {
						const index = raw.findIndex((value) => value === OPT);
						expect(index).toBeGreaterThanOrEqual(0);
						fired = true;
						restoredPosition = arrayPosition(wrapped, index, false);
						expect(restoredPosition).toBeDefined();
						const before = readOwnershipVersion(wrapped, String(index));
						alias[index] = LATER;
						reentry = {
							index,
							before,
							after: readOwnershipVersion(wrapped, String(index)),
							actual: snapshot(alias)
						};
					}
				}
				return success;
			}
		});
		const items = reactive(wrapped);
		const alias = items;
		const observed: ReturnType<typeof snapshot>[] = [];
		const reports: unknown[] = [];
		const view = computed(() => items.join('|'));
		const stop = watch(
			() => {
				observed.push(snapshot(items));
				void view.get();
			},
			undefined,
			{ onError: (error) => reports.push(error) }
		);
		let older: ReturnType<typeof captureReactiveMutations> | undefined,
			newer: ReturnType<typeof captureReactiveMutations> | undefined;
		try {
			expect(unwrap(items)).toBe(wrapped);
			older = captureReactiveMutations(() => {
				items[2] = OPT;
			});
			if (mode === 'before-clear') items[2] = LATER;
			newer = captureReactiveMutations(() => {
				items.splice(0, 3);
			});
			flushSync();
			expect(items).toHaveLength(0);
			armed = true;
			const newerResult = caught(() => newer!.rollback());
			armed = false;
			flushSync();
			const afterNewer = snapshot(items);
			const ownerAfterNewer = restoredPosition
				? readOwnershipVersion(restoredPosition, arrayPositionKey)
				: undefined;
			const olderResult = caught(() => older!.rollback());
			flushSync();
			const afterBoth = snapshot(items);
			expect(newerResult.didCatch).toBe(false);
			expect(olderResult.didCatch).toBe(false);
			expect(reports).toEqual([]);
			expect(observed.at(-1)).toEqual(afterBoth);
			expect(view.get()).toBe(items.join('|'));
			expect(unwrap(items)).toBe(wrapped);
			const expected = mode === 'unarmed' ? BASE : LATER;
			const desired = items[2] === expected;
			const trackingAfterSettlement = hasArrayPositions(wrapped);
			expect(trackingAfterSettlement).toBe(false);
			const prior = Array.from(items);
			const follow = captureReactiveMutations(() => {
				items.push('FOLLOW');
			});
			follow.rollback();
			expect(sameArray(Array.from(items), prior)).toBe(true);
			const committed = captureReactiveMutations(() => {
				items.push('KEEP');
			});
			committed.discard();
			expect(items.at(-1)).toBe('KEEP');
			flushSync();
			expect(hasArrayPositions(wrapped)).toBe(false);
			if (mode === 'reentrant') {
				expect(fired).toBe(true);
				expect(reentry?.after).not.toBe(reentry?.before);
			}
			rows.push({
				mode,
				events,
				fired,
				reentry,
				ownerAfterNewer,
				afterNewer,
				afterBoth,
				desiredSurvivesBoth: desired,
				expectedFinalMember: expected,
				newer: failureRecord(newerResult),
				older: failureRecord(olderResult),
				observed,
				reports,
				trackingAfterSettlement,
				followingRollback: true,
				followingDiscard: true,
				followingTrackingReleased: !hasArrayPositions(wrapped)
			});
		} finally {
			armed = false;
			newer?.discard();
			older?.discard();
			stop();
			flushSync();
			const count = observed.length;
			items.push('AFTER-STOP');
			flushSync();
			expect(observed).toHaveLength(count);
			expect(inspectComputed(view)?.observed).toBe(false);
		}
	}

	// Desired contract assertion deliberately fails on a reproduced baseline violation.
	expect(rows.find((row) => row.mode === 'reentrant')?.desiredSurvivesBoth).toBe(true);
});

it.each(['dense', 'interior', 'trailing', 'holes'] as const)(
	'restores full-clear descriptors and %s extent without placeholders',
	(kind) => {
		const raw = new Array<string>(3);
		if (kind !== 'holes') raw[0] = 'A';
		if (kind === 'dense') raw[1] = 'B';
		if (kind === 'dense' || kind === 'interior') raw[2] = 'C';
		const items = reactive(raw);
		const before = Object.getOwnPropertyDescriptors(raw);
		const journal = captureReactiveMutations(() => {
			items.splice(0, 3);
		});
		journal.rollback();
		expect(Object.getOwnPropertyDescriptors(raw)).toEqual(before);
		const next = captureReactiveMutations(() => {
			items.push('next');
		});
		next.rollback();
		expect(Object.getOwnPropertyDescriptors(raw)).toEqual(before);
		expect(hasArrayPositions(raw)).toBe(false);
	}
);

it('fences an in-window shared original but renews following and unrelated capture authority', () => {
	const raw = ['A', 'B', 'C'];
	let armed = false,
		fired = false;
	let sameWindow: ReturnType<typeof captureReactiveMutations> | undefined;
	let unrelated: ReturnType<typeof captureReactiveMutations> | undefined;
	let newAddress: ReturnType<typeof arrayPosition>;
	const other = reactive({ value: 'base' });
	const wrapped = new Proxy(raw, {
		defineProperty(target, key, descriptor) {
			if (armed && !fired && descriptor.value === 'A') {
				fired = true;
				items.reverse();
				const accepted = Reflect.defineProperty(target, key, descriptor);
				items.reverse();
				sameWindow = captureReactiveMutations(() => {
					items[2] = 'fresh';
				});
				unrelated = captureReactiveMutations(() => {
					other.value = 'fresh';
					items.push('new-address');
				});
				newAddress = arrayPosition(wrapped, 3, false);
				return accepted;
			}
			return Reflect.defineProperty(target, key, descriptor);
		}
	});
	const items = reactive(wrapped);
	const observed: string[] = [];
	const reports: unknown[] = [];
	const stop = watch(
		() => {
			observed.push(items.join('|'));
		},
		undefined,
		{ onError: (e) => reports.push(e) }
	);
	const older = captureReactiveMutations(() => {
		items[2] = 'optimistic';
	});
	const original = arrayPosition(wrapped, 2, false)!;
	const clear = captureReactiveMutations(() => {
		items.splice(0, 3);
	});
	try {
		armed = true;
		const result = caught(() => clear.rollback());
		armed = false;
		flushSync();
		const actual = Array.from(items);
		const current = items[2];
		const shared = caught(() => sameWindow!.rollback());
		const prior = caught(() => older.rollback());
		const preservedNewAddress = arrayPosition(wrapped, 3, false) === newAddress;
		const outside = caught(() => unrelated!.rollback());
		const beforeNext = items[2];
		const next = captureReactiveMutations(() => {
			items[2] = 'next';
		});
		const renewed = arrayPosition(wrapped, 2, false)!;
		const following = caught(() => next.rollback());
		flushSync();
		expect(result.didCatch).toBe(false);
		expect(fired).toBe(true);
		expect(current).toBe('fresh');
		expect(shared.didCatch || prior.didCatch || outside.didCatch || following.didCatch).toBe(false);
		expect(beforeNext).toBe('fresh');
		expect(items[2]).toBe(beforeNext);
		expect(renewed).not.toBe(original);
		expect(other.value).toBe('base');
		expect(newAddress).toBeDefined();
		expect(preservedNewAddress).toBe(true);
		expect(items).toHaveLength(3);
		expect(observed).toContain(actual.join('|'));
		expect(reports).toEqual([]);
	} finally {
		armed = false;
		sameWindow?.discard();
		unrelated?.discard();
		older.discard();
		clear.discard();
		stop();
		flushSync();
	}
	expect(hasArrayPositions(wrapped)).toBe(false);
});

it('refuses uncertain original addresses during unversioned batch undo and keeps named and other work', () => {
	const raw = Object.assign(['A', 'B', 'C'], { note: 'base' });
	const other = reactive({ value: 'base' });
	let armed = false,
		fired = false;
	const wrapped = new Proxy(raw, {
		defineProperty(target, key, descriptor) {
			if (armed && !fired && descriptor.value === 'A') {
				fired = true;
				items.reverse();
				const accepted = Reflect.defineProperty(target, key, descriptor);
				items.reverse();
				return accepted;
			}
			return Reflect.defineProperty(target, key, descriptor);
		}
	});
	const items = reactive(wrapped);
	const primary = { body: true };
	const result = caught(() =>
		batch(() => {
			items.note = 'optimistic';
			other.value = 'optimistic';
			items[2] = 'optimistic';
			items.splice(0, 3);
			armed = true;
			throw primary;
		})
	);
	armed = false;
	const actual = Array.from(items);
	expect(result.didCatch).toBe(true);
	expect(result.reason).toBe(primary);
	expect(fired).toBe(true);
	expect(actual[2]).toBe('A');
	expect(items.note).toBe('base');
	expect(other.value).toBe('base');
	const next = captureReactiveMutations(() => {
		items[2] = 'next';
	});
	next.rollback();
	expect(Array.from(items)).toEqual(actual);
	expect(hasArrayPositions(wrapped)).toBe(false);
});

it('detects identical-descriptor reversal through existing order authority', () => {
	const raw = ['same', 'same', 'same'];
	let armed = false,
		fired = false;
	const wrapped = new Proxy(raw, {
		defineProperty(target, key, descriptor) {
			if (armed && !fired && descriptor.enumerable === false) {
				fired = true;
				items.reverse();
				const accepted = Reflect.defineProperty(target, key, descriptor);
				items.reverse();
				return accepted;
			}
			return Reflect.defineProperty(target, key, descriptor);
		}
	});
	const items = reactive(wrapped);
	const prior = captureReactiveMutations(() => {
		Reflect.defineProperty(items, '2', {
			value: 'same',
			writable: true,
			configurable: true,
			enumerable: false
		});
	});
	const original = arrayPosition(wrapped, 2, false)!;
	const clear = captureReactiveMutations(() => {
		items.splice(0, 3);
	});
	try {
		armed = true;
		clear.rollback();
		armed = false;
		const after = Object.getOwnPropertyDescriptors(raw);
		prior.rollback();
		expect(fired).toBe(true);
		expect(original.index).toBe(-1);
		expect(Object.getOwnPropertyDescriptors(raw)).toEqual(after);
	} finally {
		armed = false;
		prior.discard();
		clear.discard();
	}
	expect(hasArrayPositions(wrapped)).toBe(false);
});

it('keeps a proven full-clear prefix when another descriptor merely refuses', () => {
	const raw = ['A', 'B', 'C'];
	let armed = false;
	const wrapped = new Proxy(raw, {
		defineProperty(target, key, descriptor) {
			if (armed && descriptor.value === 'B') return false;
			return Reflect.defineProperty(target, key, descriptor);
		}
	});
	const items = reactive(wrapped);
	const older = captureReactiveMutations(() => {
		items[2] = 'optimistic';
	});
	const clear = captureReactiveMutations(() => {
		items.splice(0, 3);
	});
	try {
		armed = true;
		clear.rollback();
		armed = false;
		expect(items[2]).toBe('optimistic');
		expect(Object.hasOwn(raw, 1)).toBe(false);
		older.rollback();
		expect(items[2]).toBe('C');
	} finally {
		armed = false;
		clear.discard();
		older.discard();
	}
	expect(hasArrayPositions(wrapped)).toBe(false);
});
