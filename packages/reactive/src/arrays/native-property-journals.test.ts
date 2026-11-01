import { expect, it } from 'vitest';
import {
	reactive,
	captureReactiveMutations,
	batch,
	watch,
	flushSync,
	unwrap,
	computed,
	inspectComputed,
	encodeReactiveProtocolValue,
	decodeReactiveProtocolValue,
	registerReactiveListKey
} from '../index.js';
import { deleteReactiveValue, writeReactiveLazy } from '../writes.js';
import {
	arrayPropertyJournalCases,
	verifyArrayPropertyJournal,
	verifyReactiveReceiverOwnership
} from '../../../component-composition-corpus/test-support/array-property-journal-journey.mjs';
const api = {
	reactive,
	captureReactiveMutations,
	batch,
	watch,
	flushSync,
	unwrap,
	writeReactiveLazy,
	deleteReactiveValue
};
it.each(arrayPropertyJournalCases)('retains native array property ownership through %s', (kind) => {
	expect(verifyArrayPropertyJournal(api, kind)).toBe(true);
});
it('retains ordinary receivers and target mutation ownership', () => {
	expect(verifyReactiveReceiverOwnership(api)).toBe(true);
});

import { hasArrayPositions, arrayPosition } from './positions.js';
import { hasActiveReactiveTransaction } from '../internal/deps.js';
const BASE = 'C-base',
	OPT = 'C-optimistic';
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

it('R2 observes primitive restoration failures, primary precedence, leases and following progress', () => {
	const rows: Record<string, unknown>[] = [];
	for (const mode of ['journal', 'batch'] as const)
		for (const fault of ['unarmed', 'zero', 'undefined'] as const) {
			const raw = ['A', 'B', BASE];
			let armed = false,
				fired = false;
			const reason = fault === 'zero' ? 0 : undefined;
			const bodyPrimary = { kind: 'body-primary', mode, fault };
			const events: Record<string, unknown>[] = [];
			let encodedAfterFirst: unknown;
			const wrapped = new Proxy(raw, {
				set(target, key, value) {
					if (armed) events.push({ phase: 'set', key: String(key), value: describeValue(value) });
					return Reflect.set(target, key, value, target);
				},
				defineProperty(target, key, descriptor) {
					if (armed && !fired && descriptor.value === 'B' && fault !== 'unarmed') {
						fired = true;
						events.push({
							phase: 'throw-before-define',
							key: String(key),
							value: descriptor.value,
							reason: describeValue(reason)
						});
						throw reason;
					}
					const success = Reflect.defineProperty(target, key, descriptor);
					if (armed) {
						events.push({
							phase: 'define',
							key: String(key),
							value: describeValue(descriptor.value),
							success
						});
						if (success && descriptor.value === OPT)
							encodedAfterFirst = encodeReactiveProtocolValue(alias);
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
			const releaseKeys = registerReactiveListKey(
				items,
				(item) => String(item),
				'rollback-baseline-N3'
			);
			let older: ReturnType<typeof captureReactiveMutations> | undefined,
				newer: ReturnType<typeof captureReactiveMutations> | undefined;
			try {
				older = captureReactiveMutations(() => {
					items[2] = OPT;
				});
				flushSync();
				encodeReactiveProtocolValue(items);
				let result: ReturnType<typeof caught>;
				if (mode === 'journal') {
					newer = captureReactiveMutations(() => {
						items.splice(0, 3);
					});
					flushSync();
					armed = true;
					result = caught(() => newer!.rollback());
				} else {
					result = caught(() =>
						batch(() => {
							items.splice(0, 3);
							armed = true;
							throw bodyPrimary;
						})
					);
				}
				armed = false;
				flushSync();
				const afterFailure = snapshot(items);
				const observedAfterFailure = observed.at(-1);
				const cachedAfterFailure = encodeReactiveProtocolValue(items);
				const computedAfterFailure = view.get();
				const trackingAfterFailure = hasArrayPositions(wrapped);
				const predecessor = caught(() => older!.rollback());
				newer?.discard();
				older.discard();
				flushSync();
				const afterSettlement = snapshot(items);
				const trackingAfterSettlement = hasArrayPositions(wrapped);
				const beforeFollow = Array.from(items);
				const follow = caught(() => {
					const journal = captureReactiveMutations(() => {
						items.push('FOLLOW');
					});
					journal.rollback();
				});
				const afterFollowingRollback = snapshot(items);
				const followingRollbackPreserves = sameArray(Array.from(items), beforeFollow);
				const discard = caught(() => {
					const journal = captureReactiveMutations(() => {
						items.push('KEEP');
					});
					journal.discard();
					expect(items.at(-1)).toBe('KEEP');
				});
				const nextPrimary = { kind: 'following-body' };
				const nextBatch = caught(() =>
					batch(() => {
						items.push('BATCH');
						throw nextPrimary;
					})
				);
				expect(nextBatch.didCatch).toBe(true);
				expect(nextBatch.reason).toBe(nextPrimary);
				expect(items.at(-1)).toBe('KEEP');
				flushSync();
				expect(discard.didCatch).toBe(false);
				expect(reports).toEqual([]);
				expect(hasActiveReactiveTransaction()).toBe(false);
				expect(unwrap(items)).toBe(wrapped);
				if (fault === 'unarmed') {
					expect(fired).toBe(false);
					expect(result.didCatch).toBe(mode === 'batch');
					if (mode === 'batch') expect(result.reason).toBe(bodyPrimary);
					expect(trackingAfterSettlement).toBe(false);
				} else {
					expect(fired).toBe(true);
					expect(result.didCatch).toBe(true);
					expect(result.reason).toBe(mode === 'batch' ? bodyPrimary : reason);
				}
				rows.push({
					mode,
					fault,
					events,
					fired,
					reason: describeValue(reason),
					result: failureRecord(result),
					isExactRestorationReason: result.didCatch && Object.is(result.reason, reason),
					isExactBodyPrimary: result.didCatch && result.reason === bodyPrimary,
					bodyPrimary,
					afterFailure,
					observedAfterFailure,
					observerCurrent: JSON.stringify(afterFailure) === JSON.stringify(observedAfterFailure),
					computedAfterFailure,
					computedCurrent:
						computedAfterFailure ===
						afterFailure.values.map((value) => (typeof value === 'string' ? value : '')).join('|'),
					expectedHashKeys: afterFailure.values.map((value) =>
						typeof value === 'string' ? value : 'undefined'
					),
					expectedHashCount: afterFailure.length,
					encodedAfterFirst,
					cachedAfterFailure,
					predecessor: failureRecord(predecessor),
					afterSettlement,
					trackingAfterFailure,
					trackingAfterSettlement,
					trackingAfterFollowing: hasArrayPositions(wrapped),
					followingRollback: !follow.didCatch,
					followingRollbackResult: failureRecord(follow),
					followingRollbackPreserves,
					afterFollowingRollback,
					beforeFollowingRollback: beforeFollow.map(describeValue),
					followingDiscard: !discard.didCatch,
					followingBatchExactPrimary: nextBatch.reason === nextPrimary,
					reports
				});
			} finally {
				armed = false;
				newer?.discard();
				older?.discard();
				releaseKeys();
				stop();
				flushSync();
				const count = observed.length;
				items.push('AFTER-STOP');
				flushSync();
				expect(observed).toHaveLength(count);
				expect(inspectComputed(view)?.observed).toBe(false);
				expect(Array.isArray(encodeReactiveProtocolValue(items))).toBe(true);
			}
		}

	for (const row of rows) {
		expect(row.observerCurrent).toBe(true);
		expect(row.computedCurrent).toBe(true);
		if (new Set(row.expectedHashKeys as string[]).size === row.expectedHashCount) {
			expect(row.cachedAfterFailure).toHaveProperty('keys', row.expectedHashKeys);
			expect(row.cachedAfterFailure).toHaveProperty('itemHashes.length', row.expectedHashCount);
		} else {
			// Partial holes can repeat the registered key. The existing codec then uses plain items.
			expect(Array.isArray(row.cachedAfterFailure)).toBe(true);
			expect(row.cachedAfterFailure).toHaveLength(row.expectedHashCount as number);
			const decoded = decodeReactiveProtocolValue(row.cachedAfterFailure);
			expect(Array.isArray(decoded)).toBe(true);
			if (Array.isArray(decoded))
				expect(Array.from(decoded, describeValue)).toEqual(
					(row.afterFailure as ReturnType<typeof snapshot>).values
				);
		}

		expect(row.followingRollbackPreserves).toBe(true);
		if (row.fault !== 'unarmed')
			expect(row.mode === 'batch' ? row.isExactBodyPrimary : row.isExactRestorationReason).toBe(
				true
			);
	}
	// Desired cleanup contract is distinct from recording actual primitive propagation.
	expect(
		rows
			.filter((row) => row.fault !== 'unarmed')
			.every(
				(row) => row.trackingAfterSettlement === false && row.followingRollbackPreserves === true
			)
	).toBe(true);
});

it('retires failed residual under a live successor without discarding unrelated known work', () => {
	let armed = false;
	const raw = new Proxy(['A', 'B', 'C'], {
		defineProperty(target, key, descriptor) {
			if (armed && descriptor.value === 'B') throw 0;
			return Reflect.defineProperty(target, key, descriptor);
		}
	});
	const items = reactive(raw);
	const state = reactive({ value: 'base' });
	const independent = reactive({ value: 'base' });
	const older = captureReactiveMutations(() => {
		independent.value = 'older';
	});
	const failed = captureReactiveMutations(() => {
		state.value = 'failed';
		items.splice(0, 3);
	});
	const successor = captureReactiveMutations(() => {
		state.value = 'successor';
	});
	armed = true;
	const result = caught(() => failed.rollback());
	armed = false;
	expect(result.didCatch).toBe(true);
	expect(result.reason).toBe(0);
	expect(hasArrayPositions(raw)).toBe(false);
	expect(state.value).toBe('successor');
	successor.rollback();
	expect(state.value).toBe('failed');
	failed.rollback();
	failed.discard();
	expect(state.value).toBe('failed');
	older.rollback();
	expect(independent.value).toBe('base');
	const before = Array.from(items);
	const next = captureReactiveMutations(() => {
		items.push('next');
	});
	next.rollback();
	expect(Array.from(items)).toEqual(before);
	expect(hasArrayPositions(raw)).toBe(false);
});

it.each(['reentrant', 'refused'] as const)(
	'does not hand off an incomplete or superseded descriptor (%s)',
	(mode) => {
		let armed = false;
		const raw = new Proxy(['A', 'B', 'base'], {
			defineProperty(target, key, descriptor) {
				if (armed && descriptor.value === 'older') {
					armed = false;
					if (mode === 'refused') return false;
					const completed = Reflect.defineProperty(target, key, descriptor);
					items[2] = 'independent';
					return completed;
				}
				return Reflect.defineProperty(target, key, descriptor);
			}
		});
		const items = reactive(raw);
		const older = captureReactiveMutations(() => {
			items[2] = 'older';
		});
		const newer = captureReactiveMutations(() => {
			items[2] = 'newer';
		});
		armed = true;
		newer.rollback();
		armed = false;
		const expected = mode === 'refused' ? 'newer' : 'independent';
		expect(items[2]).toBe(expected);
		older.rollback();
		expect(items[2]).toBe(expected);
		expect(hasArrayPositions(raw)).toBe(false);
		const next = captureReactiveMutations(() => {
			items.push('next');
		});
		next.rollback();
		expect(Array.from(items)).toEqual(['A', 'B', expected]);
	}
);

it('keeps an independent write made while reading a length-restoration descriptor', () => {
	const rows = [];
	for (const reentrant of [false, true]) {
		let armed = false;
		let fired = false;
		const raw = new Proxy(['A', 'B', 'base'], {
			getOwnPropertyDescriptor(target, key) {
				const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
				if (
					armed &&
					reentrant &&
					!fired &&
					key === '2' &&
					target.length === 3 &&
					target[0] === 'A' &&
					target[1] === 'B'
				) {
					fired = true;
					items[2] = 'independent';
				}
				return descriptor;
			}
		});
		const items = reactive(raw);
		const older = captureReactiveMutations(() => {
			items[2] = 'older';
		});
		const newer = captureReactiveMutations(() => {
			items.length = 0;
		});
		armed = true;
		const restored = caught(() => newer.rollback());
		armed = false;
		const afterNewer = Array.from(items);
		const predecessor = caught(() => older.rollback());
		const afterBoth = Array.from(items);
		const next = captureReactiveMutations(() => {
			items.push('next');
		});
		const following = caught(() => next.rollback());
		rows.push({
			reentrant,
			fired,
			restored: failureRecord(restored),
			predecessor: failureRecord(predecessor),
			afterNewer,
			afterBoth,
			following: failureRecord(following),
			afterFollowing: Array.from(items),
			tracking: hasArrayPositions(raw),
			transaction: hasActiveReactiveTransaction()
		});
	}
	// Collect both lifetimes before checking the desired ownership outcome.
	expect(rows).toEqual(
		[false, true].map((reentrant) => ({
			reentrant,
			fired: reentrant,
			restored: { didCatch: false, reason: { undefined: true } },
			predecessor: { didCatch: false, reason: { undefined: true } },
			afterNewer: ['A', 'B', reentrant ? 'independent' : 'older'],
			afterBoth: ['A', 'B', reentrant ? 'independent' : 'base'],
			following: { didCatch: false, reason: { undefined: true } },
			afterFollowing: ['A', 'B', reentrant ? 'independent' : 'base'],
			tracking: false,
			transaction: false
		}))
	);
});

it('owns postwrite length acquisition across a reentrant fresh push and renews following addresses', () => {
	const rows: Array<Record<string, unknown>> = [];
	for (const armed of [false, true]) {
		const raw = ['A', 'B', 'C'];
		let afterWrite = false,
			fired = false;
		let nested: ReturnType<typeof captureReactiveMutations> | undefined;
		const wrapped = new Proxy(raw, {
			set(target, key, value) {
				const accepted = Reflect.set(target, key, value, target);
				if (key === 'length' && value === 0) afterWrite = true;
				return accepted;
			},
			get(target, key, receiver) {
				const value = Reflect.get(target, key, receiver);
				if (armed && afterWrite && !fired && key === 'length') {
					fired = true;
					nested = captureReactiveMutations(() => {
						items.push('fresh');
					});
				}
				return value;
			}
		});
		const items = reactive(wrapped);
		const reports: unknown[] = [];
		const stop = watch(() => items.join('|'), undefined, {
			onError: (error) => reports.push(error)
		});
		const older = captureReactiveMutations(() => {
			items[0] = 'optimistic';
		});
		const original = arrayPosition(wrapped, 0, false)!;
		let lengthJournal: ReturnType<typeof captureReactiveMutations> | undefined;
		try {
			const write = caught(() => {
				lengthJournal = captureReactiveMutations(() => {
					items.length = 0;
				});
			});
			const afterWriteValues = Array.from(items);
			const rollback = caught(() => lengthJournal!.rollback());
			const nestedResult = caught(() => nested?.rollback());
			const olderResult = caught(() => older.rollback());
			const beforeFollowing = Array.from(items);
			const following = captureReactiveMutations(() => {
				items[0] = 'next';
			});
			const renewed = arrayPosition(wrapped, 0, false)!;
			const next = caught(() => following.rollback());
			rows.push({
				armed,
				fired,
				write,
				afterWriteValues,
				rollback,
				nestedResult,
				olderResult,
				beforeFollowing,
				afterFollowing: Array.from(items),
				renewed: renewed !== original,
				next,
				reports,
				expected: armed ? ['fresh'] : ['A', 'B', 'C']
			});
		} finally {
			nested?.discard();
			lengthJournal?.discard();
			older.discard();
			stop();
			flushSync();
		}
		expect(hasArrayPositions(wrapped)).toBe(false);
	}
	// Both outcomes are collected before comparing the current and following owner contracts.
	for (const row of rows) {
		expect(row.fired).toBe(row.armed);
		expect(row.afterWriteValues).toEqual(row.armed ? ['fresh'] : []);
		expect(row.beforeFollowing).toEqual(row.expected);
		expect(row.afterFollowing).toEqual(row.beforeFollowing);
		expect(row.renewed).toBe(true);
		expect(row.reports).toEqual([]);
		for (const name of ['write', 'rollback', 'nestedResult', 'olderResult', 'next'])
			expect(row[name]).toHaveProperty('didCatch', false);
	}
});

it('retains a detached hole address through truncation, a new push and older journal rollback', () => {
	const raw = ['A', 'B', 'C'];
	const items = reactive(raw);
	const older = captureReactiveMutations(() => {
		delete items[1];
	});
	const original = arrayPosition(raw, 1, false)!;
	const length = captureReactiveMutations(() => {
		items.length = 1;
	});
	const inserted = captureReactiveMutations(() => {
		items.push('new');
	});
	try {
		expect(arrayPosition(raw, 1, false)).not.toBe(original);
		inserted.rollback();
		length.rollback();
		expect(Object.hasOwn(raw, 1)).toBe(false);
		expect(arrayPosition(raw, 1, false)).toBe(original);
		older.rollback();
		expect(items).toEqual(['A', 'B', 'C']);
	} finally {
		inserted.discard();
		length.discard();
		older.discard();
	}
	expect(hasArrayPositions(raw)).toBe(false);
});
