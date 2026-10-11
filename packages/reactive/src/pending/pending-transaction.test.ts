import { expect, it } from 'vitest';
import { reactive } from '../reactive.js';
import { flushSync } from '../internal/scheduler.js';
import { watch } from '../observation.js';
import { createPendingReactiveTransaction } from './pending-state.js';

it.each(['commit', 'discard'] as const)(
	'allows a returned helper to receive fresh input after %s while fencing retained input',
	(settle) => {
		const root = reactive({ count: 1 });
		const first = createPendingReactiveTransaction(root);
		const oldView = first.view(root);
		const retaining = () => ++oldView.count;
		const prepare = (input: typeof root) => {
			const step = input.count;
			return (next: typeof root) => (next.count += step);
		};
		const accepting = prepare(oldView);
		first[settle]();
		expect(() => retaining()).toThrow('closed');
		expect(root.count).toBe(1);
		const second = createPendingReactiveTransaction(root);
		try {
			expect(accepting(second.view(root))).toBe(2);
			expect(root.count).toBe(1);
			second.commit();
		} finally {
			second.discard();
		}
		expect(root.count).toBe(2);
		expect(accepting(root)).toBe(3);
	}
);

for (const writer of ['plain', 'reactive'] as const)
	for (const order of ['writer-first', 'reader-first'] as const)
		it(`preserves ${writer} writer policy with ${order} readonly aliases`, () => {
			for (const settle of ['discard', 'commit'] as const) {
				const raw = {
					count: 1,
					removable: true,
					values: [1],
					lookup: new Map([['key', 1]]),
					members: new Set([1])
				};
				const mutable = writer === 'reactive' ? reactive(raw) : raw;
				const readonly = reactive(raw, { readonly: true });
				const root = { mutable, readonly };
				const pending = createPendingReactiveTransaction(root);
				for (const key of order === 'writer-first'
					? ['mutable', 'readonly']
					: ['readonly', 'mutable']) {
					const owner = pending.read(root, key) as typeof raw;
					for (const field of ['values', 'lookup', 'members']) pending.read(owner, field);
				}
				try {
					expect(() => pending.helper((owner: typeof raw) => owner.count++)(readonly)).toThrow(
						'readonly'
					);
					expect(() =>
						pending.helper((owner: typeof raw) => Reflect.deleteProperty(owner, 'removable'))(
							readonly
						)
					).toThrow('readonly');
					expect(() =>
						pending.helper((owner: typeof raw) => owner.values.push(9))(readonly)
					).toThrow('readonly');
					expect(() =>
						pending.helper((owner: typeof raw) => owner.lookup.set('key', 9))(readonly)
					).toThrow('readonly');
					expect(() =>
						pending.helper((owner: typeof raw) => owner.members.add(9))(readonly)
					).toThrow('readonly');
					pending.helper((owner: typeof raw) => {
						owner.count = 5;
						Reflect.deleteProperty(owner, 'removable');
						owner.values.push(2);
						owner.lookup.set('key', 2);
						owner.members.add(2);
					})(mutable);
					expect(pending.view(readonly).count).toBe(5);
					expect(raw.count).toBe(1);
					expect(raw.values).toEqual([1]);
					expect(raw.lookup.get('key')).toBe(1);
					expect([...raw.members]).toEqual([1]);
					pending[settle]();
					expect(raw.count).toBe(settle === 'commit' ? 5 : 1);
					expect('removable' in raw).toBe(settle !== 'commit');
					expect(raw.values).toEqual(settle === 'commit' ? [1, 2] : [1]);
					expect(raw.lookup.get('key')).toBe(settle === 'commit' ? 2 : 1);
					expect([...raw.members]).toEqual(settle === 'commit' ? [1, 2] : [1]);
				} finally {
					pending.discard();
				}
			}
		});

it.each(['commit', 'discard'] as const)(
	'fences retained reads and helper effects after %s',
	(settle) => {
		const root = reactive({ count: 1, when: new Date(9) });
		const pending = createPendingReactiveTransaction(root);
		const view = pending.view(root);
		const date = pending.read(root, 'when');
		const dateReader = pending.helper(Date.prototype.valueOf, date);
		let effects = 0;
		const helper = pending.helper((owner: typeof root) => {
			effects++;
			return owner.count;
		});
		expect(dateReader()).toBe(9);
		expect(helper(root)).toBe(1);
		expect(Object.keys(view)).toEqual(['count', 'when']);
		expect('count' in view).toBe(true);
		pending[settle]();
		expect(() => pending.read(root, 'count')).toThrow('closed');
		expect(() => helper(root)).toThrow('closed');
		expect(effects).toBe(1);
		expect(() => dateReader()).toThrow('closed');
		expect(() => 'count' in view).toThrow('closed');
		expect(() => Object.keys(view)).toThrow('closed');
		expect(() => Object.getOwnPropertyDescriptor(view, 'count')).toThrow('closed');
	}
);

it('preserves native Date brands through direct, borrowed and unchanged helper readers', () => {
	const root = reactive({ when: new Date(9) });
	const pending = createPendingReactiveTransaction(root);
	const when = pending.read(root, 'when') as Date;
	expect(pending.helperMember(when, 'getTime')()).toBe(9);
	expect(pending.helper(Date.prototype.valueOf, when)()).toBe(9);
	expect(pending.helper((owner: typeof root) => owner.when.toJSON())(root)).toBe(
		'1970-01-01T00:00:00.009Z'
	);
	expect(pending.helper((owner: typeof root) => +owner.when)(root)).toBe(9);
	pending.discard();
});

it('rejects owned Date timestamp mutation before effects and permits value replacement', () => {
	const root = reactive({ when: new Date(0) });
	const pending = createPendingReactiveTransaction(root);
	const when = pending.read(root, 'when') as Date;
	expect(() => pending.helperMember(when, 'setTime')(9)).toThrow('replacing the Date');
	expect(() => pending.helper((owner: typeof root) => owner.when.setTime(9))(root)).toThrow(
		'replacing the Date'
	);
	expect(root.when.getTime()).toBe(0);
	pending.write(root, 'when', new Date(9));
	expect(root.when.getTime()).toBe(0);
	pending.commit();
	expect(root.when.getTime()).toBe(9);
});

it.each(['commit', 'discard'] as const)('fences retained collection cursors after %s', (settle) => {
	const root = reactive({
		values: new Map([
			['a', 1],
			['b', 2]
		])
	});
	const pending = createPendingReactiveTransaction(root);
	const values = pending.read(root, 'values') as object;
	const iterator = pending.call(values, 'values', []) as Iterator<number>;
	expect(iterator.next().value).toBe(1);
	pending.call(values, 'set', ['c', 3]);
	expect(iterator.next().value).toBe(2);
	expect(iterator.next().value).toBe(3);
	pending[settle]();
	expect(() => iterator.next()).toThrow('closed');
	expect([...root.values.values()]).toEqual(settle === 'commit' ? [1, 2, 3] : [1, 2]);
});

it('isolates overlapping pending views across suspension and publishes one coherent transition', async () => {
	const root = reactive({ count: 0, values: new Map<string, number>() });
	const observed: string[] = [];
	const stop = watch(() => observed.push(`${root.count}:${root.values.get('x')}`));
	try {
		const first = createPendingReactiveTransaction(root);
		const second = createPendingReactiveTransaction(root);
		first.write(root, 'count', 1);
		second.write(root, 'count', 2);
		const map = second.read(root, 'values') as object;
		second.call(map, 'set', ['x', 9]);
		await second.await(Promise.resolve());
		expect(first.read(root, 'count')).toBe(1);
		expect(second.read(root, 'count')).toBe(2);
		expect(root.count).toBe(0);
		first.discard();
		second.commit();
		flushSync();
		expect(observed).toEqual(['0:undefined', '2:9']);
		expect(() => first.write(root, 'count', 3)).toThrow('closed');
		expect(() => second.write(root, 'count', 4)).toThrow('closed');
	} finally {
		stop();
	}
});

it('supplies unchanged helpers with shared pending property and collection semantics', () => {
	const root = reactive({ count: 0, values: [1], map: new Map<string, number>() });
	const pending = createPendingReactiveTransaction(root);
	const result = pending.helper((owner: typeof root) => {
		owner.count = owner.values.push(2);
		owner.map.set('x', owner.count);
		return [owner.count, owner.map.get('x'), owner.values.length];
	})(root);
	expect(result).toEqual([2, 2, 2]);
	expect(root.count).toBe(0);
	expect(root.values).toEqual([1]);
	pending.commit();
	expect(root.count).toBe(2);
	expect(root.values).toEqual([1, 2]);
	expect(root.map.get('x')).toBe(2);
});

it('rolls back standalone publication failures and prevents replay', () => {
	const raw = { count: 0, rejected: 0 };
	const root = reactive(raw);
	const pending = createPendingReactiveTransaction(root);
	pending.write(root, 'count', 9);
	pending.write(root, 'rejected', 1);
	Object.defineProperty(raw, 'rejected', {
		set() {
			throw new Error('Rejected');
		},
		configurable: true
	});
	expect(() => pending.commit()).toThrow('Rejected');
	expect(root.count).toBe(0);
	expect(() => pending.commit()).toThrow('closed');
});

it('runs plain accessors in authored order against pending dependent fields', () => {
	const root = reactive({
		stored: 0,
		get count() {
			return this.stored * 2;
		},
		set count(value: number) {
			this.stored = Math.max(0, value);
		}
	});
	const pending = createPendingReactiveTransaction(root);
	pending.write(root, 'count', 3);
	expect(pending.read(root, 'count')).toBe(6);
	expect(root.count).toBe(0);
	pending.commit();
	expect(root.count).toBe(6);
});

it('orders host publication with ordinary host writes and invalidates callbacks after discard', () => {
	const root = reactive({ count: 0 });
	const work: Array<() => void> = [];
	const pending = createPendingReactiveTransaction(root, {
		stage: (mutation) => work.push(mutation)
	});
	pending.write(root, 'count', 1);
	work.push(() => {
		root.count = 2;
	});
	pending.write(root, 'count', 3);
	expect(() => pending.commit()).toThrow('host');
	for (const mutation of work) mutation();
	expect(root.count).toBe(3);
	const stale: Array<() => void> = [];
	const rejected = createPendingReactiveTransaction(root, {
		stage: (mutation) => stale.push(mutation)
	});
	rejected.write(root, 'count', 4);
	rejected.discard();
	expect(() => stale[0]!()).toThrow('closed');
	expect(root.count).toBe(3);
});

it('enumerates pending integer properties in native order and moves reinserted strings to the end', () => {
	const root = reactive({ '8': 8, first: 1, last: 2 } as Record<string, number>);
	const pending = createPendingReactiveTransaction(root);
	pending.write(root, '2', 2);
	pending.remove(root, 'first');
	pending.write(root, 'first', 9);
	expect(Object.keys(pending.view(root))).toEqual(['2', '8', 'last', 'first']);
	pending.discard();
});

it('publishes touched nested references into each reconciled owner', () => {
	const root = reactive({ first: { nested: { count: 0 } }, second: { nested: { count: 0 } } });
	const first = root.first.nested;
	const second = root.second.nested;
	const transaction = createPendingReactiveTransaction(root);
	const replacement = { nested: { count: 1 } };
	transaction.write(root, 'first', replacement);
	transaction.write(root, 'second', replacement);
	const selected = transaction.read(replacement, 'nested') as typeof first;
	transaction.write(selected, 'count', 9);
	transaction.commit();
	expect(root.first.nested).toBe(first);
	expect(root.second.nested).toBe(second);
	expect(first.count).toBe(9);
	expect(second.count).toBe(9);
});

it('keeps a selected reconciled alias detached after its parent property is removed', () => {
	const root = reactive({ branch: { nested: { count: 0 } } as { nested?: { count: number } } });
	const retained = root.branch.nested!;
	const transaction = createPendingReactiveTransaction(root);
	const replacement = { nested: { count: 1 } };
	transaction.write(root, 'branch', replacement);
	const child = transaction.read(replacement, 'nested') as object;
	transaction.remove(replacement, 'nested');
	transaction.write(child, 'count', 9);
	transaction.commit();
	expect(root.branch.nested).toBeUndefined();
	expect(retained.count).toBe(9);
});

it('adopts pending collection values consistently during iteration', () => {
	const root = reactive({ map: new Map<string, { count: number }>() });
	const transaction = createPendingReactiveTransaction(root);
	const map = transaction.read(root, 'map') as object;
	const value = { count: 0 };
	transaction.call(map, 'set', ['x', value]);
	const selected = [...(transaction.call(map, 'values', []) as Iterable<typeof value>)][0]!;
	transaction.write(selected, 'count', 9);
	expect(value.count).toBe(0);
	expect(root.map.size).toBe(0);
	transaction.commit();
	expect(root.map.get('x')!.count).toBe(9);
});
